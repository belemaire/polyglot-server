/*
Copyright 2015 Benoit Lemaire

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var child_process = require('child_process');
var exec = require('child_process').exec;
var fs = require('fs');
var bodyParser = require('body-parser');
var app = require('express')();
var http = require('http').Server(app);
var _ = require('underscore');
var config = require('./config.json');

var relativeRuntimePath = 'runtime';

/**
 RUN CODE HANDLER AND RELATED UTILITIES
 POST /run/{languageId}
*/

function run(request, response) {
  var languageId = request.params.languageId;
  var filename = request.body.filename;
  var content = request.body.content;

  var decodedContent = new Buffer(content, 'base64').toString();
  var language = _.findWhere(config.languages, {id: languageId});
  var imagename = language.imagename;
  var command = pileRunCommandFor(language, filename);

  var runCode = function() {
    writeSourceCodeToFile(filename, decodedContent, function() {
      runDockerContainer(imagename, command, function onRun(err, result) {
        if (result.stdout != null) {
          result.stdout.pipe(response);
        } else if (result.stderr != null) {
          result.stderr.pipe(response);
        }
      });
    });
  };

  // Check if image is stored locally ...
  isImageStoredLocally(
        imagename,
        runCode,  // ... if it is run code directly !
        function onImageNotStoredLocally() { // otherwise pull image before run
          pullDockerImage(imagename, runCode);
        });
}

function writeSourceCodeToFile(filename, content, callback) {
  fs.writeFile('./' + relativeRuntimePath + '/' + filename,
               content,
               function onWriteFileCompleted() {
    callback();
  });
}

function isImageStoredLocally(imagename, onImageStoreLocally, onImageNotStoredLocally) {
  exec("docker images | grep " + imagename, function (err, stdout, stderr) {
    if (stdout) {
      onImageStoreLocally();
    } else {
      onImageNotStoredLocally();
    }
  });
}

function getCompileRunCommandFor(language, filename) {
  var result = "";
  if (language.compile) {
    result += language.compile.replace(/%BASENAME%/g, getBaseName(filename));
    result += " && ";
  }
  result += language.run.replace(/%BASENAME%/g, getBaseName(filename));
  return result;
}

/**
 GET SUPPORTED LANGUAGES HANDLER
 GET /languages
*/

function getLanguages(req, res) {
  var languagesArray = _.map(config.languages, function(language) {
      return {
        "id": language.id,
        "name": language.name,
        "extension": language.extension
      };
  });

  res.send(languagesArray);
  next();
}

// Gets the basename of a given filename (i.e filename without extension)
// For example, if filename is 'HelloWorld.java' basename is 'HelloWorld'
function getBaseName(filename) {
  return filename.split('.')[0];
}

// Gets the extension of a given filename
// For example, if filename if 'HelloWorld.java' extension is 'java'
function getExtension(filename) {
  return filename.split('.')[1];
}

function runDockerContainer(imageName, command, callback) {
  var runDockerContainer = child_process.spawn(
    'docker', ['run', '--rm', '-P',
    '-v',  __dirname + '/' + relativeRuntimePath + ':/usr/src/myapp',
    '-w', '/usr/src/myapp',
    imageName,
    'sh', '-c', command ]);

  var result = {};
  result.stdout = runDockerContainer.stdout;
  result.stderr = runDockerContainer.stderr;
  callback(null, result);
}


function pullDockerImage(imageName, callback) {
  var dockerPull = child_process.spawn('docker', ['pull', imageName]);
  dockerPull.stdout.on('data', function(data) {
    console.log(data.toString());
  });
  dockerPull.stderr.on('data', function(data) {
    console.log(data.toString());
  });
  dockerPull.on('close', function(code) {
    callback();
  });
}

app.use(bodyParser.json()); // for parsing application/json

app.post('/run/:languageId', run);
app.get('/languages', getLanguages);

http.listen(8889, function() {
 console.log('Polyglot server listening to port 8889');
});
