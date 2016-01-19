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
var io = require('socket.io')(http);

var relativeRuntimePath = 'runtime';
var relativeCodeSamplesPath = 'codesamples';

/**
 RUN CODE HANDLER AND RELATED UTILITIES
 POST /run/{languageId}
*/

function run(request, response) {
  var languageId = request.languageId;
  var filename = request.filename;
  var content = request.content;

  var decodedContent = new Buffer(content, 'base64').toString();
  var language = _.findWhere(config.languages, {id: languageId});
  var imagename = language.imagename;
  var command = getCompileRunCommandFor(language, filename);

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

function runOverWebSocket(request, socket) {
  var languageId = request.language.id;
  var filename = request.filename;
  var content = request.content;

  console.log('languageId is : ' + languageId);
  console.log('filename is : ' + filename);
  console.log('content is : ' + content);

  var decodedContent = new Buffer(content, 'base64').toString();
  var language = _.findWhere(config.languages, {id: languageId});
  var imagename = language.imagename;

  var command = getCompileRunCommandFor(language, filename);

  var runCode = function() {
    writeSourceCodeToFile(filename, decodedContent, function() {
      runDockerContainer(imagename, command, function onRun(err, result) {
        if (result.stdout != null) {
          console.log("Binding to stdout");
          result.stdout.on('data', function(chunk) {
            console.log("Received data from stdout : " + chunk);
            socket.emit('stdout_stream', chunk);
          });
        } else if (result.stderr != null) {
          console.log("Binding to stderr");
          result.stderr.on('data', function(chunk) {
            console.log("Received data from stdout : " + chunk);
            socket.emit('stderr_stream', chunk);
          });
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
        "extension": language.extension,
        "repl": language.repl
      };
  });

  res.send(languagesArray);
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
  console.log("Running docker container for imageName " + imageName);

  var runDockerContainer = child_process.spawn(
    'docker', ['run', '--rm', '-P',
    '-v',  __dirname + '/' + relativeRuntimePath + ':/usr/src/myapp',
    '-w', '/usr/src/myapp',
    imageName,
    'sh', '-c', command ]);

  var result = {};
  result.stdout = runDockerContainer.stdout;
  result.stderr = runDockerContainer.stderr;

  console.log("result stdout is " + result.stdout);
  console.log("result stderr is " + result.stderr);

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

function startRepl(languageId, callback) {
  var language = _.findWhere(config.languages, {id: languageId});
  var imagename = language.imagename;
  isImageStoredLocally(imagename,
    function onImageStoredLocally() {
      launchRepl(language, callback);
    },
    function onImageNotStoredLocally() {
      pullDockerImage(imagename, function onDockerImagePulled() {
        launchRepl(language, callback);
      });
    }
  );
}

function launchRepl(language, callback) {
  var imagename = language.imagename;
  var replcommand = language.repl;

  // Force remove container if it already exists ! (- hacky -)
  child_process.spawnSync('docker', ['rm', '-f', language.id + '_repl']);
  var replcontainer = child_process.spawn('docker', ['run', '--name', language.id + '_repl', '-i', imagename, replcommand]);

  callback(replcontainer.stdout, replcontainer.stderr, replcontainer.stdin);
}

function getCodeSample(request, response) {
  var lang = _.find(config.languages, function(language) {
    return language.id == request.params.languageId;
  });

  if (lang) {
    fs.readFile('./' + relativeCodeSamplesPath + '/' + lang.codeSampleFileName, function(err, data) {
      response.send({"base64encodedsample" : data.toString('base64')});
    });
  }
}

app.use(bodyParser.json()); // for parsing application/json

app.post('/run/:languageId', run);
app.get('/languages', getLanguages);
app.get('/codesample/:languageId', getCodeSample);

// Incoming client websocket connection
io.on('connection', function(socket){
  socket.on('disconnect', function(){});

  socket.on('run', function(msg) {
    runOverWebSocket(JSON.parse(msg), socket);
  });

  socket.on('startRepl', function(msg) {
    var obj = JSON.parse(msg);
    startRepl(obj.languageId, function cb(stdout, stderr, stdin) {
      socket.on('repl_in', function(msg) {
        stdin.write(msg, 'utf8');
      });
      if (null != stdout) {
        stdout.on('data', function(chunk) {
          socket.emit('repl_out', chunk);
        });
      }
      if (null != stderr) {
        stderr.on('data', function(chunk) {
          socket.emit('repl_err', chunk);
        });
      }
    });
  });
  socket.on('stopRepl', function(msg) {
    var obj = JSON.parse(msg);
    stopRepl(obj.languageId);
  });
});

http.listen(8889, function() {
 console.log('Polyglot server listening to port 8889');
});
