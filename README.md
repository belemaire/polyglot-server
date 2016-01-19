Polyglot Server
===============

Node.js project files, including source code, accompanying the article series *Building a cross-platform & cross-language IDE* that can be found at http://blog.benoit-sandbox.io

This branch represents the resulting project structure and content following **Part III** of this series.

You need to have **Docker** installed in order to run this application.

####Running locally (hacking & testing)

Run `npm install` before first execution of the app.
Then run `node index.js` to launch the server.

####Running inside a Docker container (distribution & production)

Build image `docker build -t belemaire/polyglot .`
-OR-
Retrieve pre-built image `docker pull belemaire/polyglot`

Run container with image `docker run --privileged -d -p 8889/tcp belemaire/polyglot`

You can get sample requests from the following Postman collection : https://www.getpostman.com/collections/0e1611f7a2d1615ea8ce

Enjoy !
