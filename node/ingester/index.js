'use strict';

const fastifyStart = require('fastify');
const { Mutex } = require('async-mutex');
const fs = require('fs');
const path = require('path');

const port = 80;
const listenAddress = '0.0.0.0';

const mutex = new Mutex();

async function start() {
  let receivedFirstRequest = false;
  let totalLines = 0;

  const fastify = fastifyStart({});
  fastify.register(require('fastify-compress'));

  fastify.get('/', function (request, reply) {
    reply.code(200).send('OK: ingester running');
  });

  fastify.get('/count', function (r, reply) {
    reply.code(200).send(totalLines.toString());
  });

  fastify.delete('/count', function (r, reply) {
    totalLines = 0;
    reply.code(200).send('OK: deleted');
  });

  fastify.post('/logs/agent', async function (request, reply) {
    if (!receivedFirstRequest) {
      receivedFirstRequest = true;
      console.log('Ingester received first request');
    }

    // One at a time
    const release = await mutex.acquire();
    try {

      const lines = request.body.ls || request.body.lines;

      const map = new Map();
      for (const line of lines) {
        let fileLines = map.get(line.file);
        if (!fileLines) {
          fileLines = [];
          map.set(line.file, fileLines);
        }

        let l = line.line;
        if (l.startsWith('{') && l.endsWith('}')) {
          l = JSON.parse(l).log;
        }

        fileLines.push(l);
      }

      await Promise.all(
        Array
          .from(map)
          .map(([file, lines]) => {
            const fileName = path.join('/root', 'output', file.replace(/\//g, '_'));
            return fs.promises.appendFile(fileName, lines.join('\n'));
          })
      );

      reply.code(200).send('OK');
    } finally {
      release();
    }
  });

  await fastify.listen(port, listenAddress);

  console.log(`Ingester listening on http://${listenAddress}:${port}`);
}

start()
  .catch(e => {
    console.error('There was an error while starting the ingester', e);
    process.exit(1);
  });
