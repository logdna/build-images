FROM node:14-buster

RUN mkdir /root/output
WORKDIR /root/ingester
COPY package.json .
RUN npm install

COPY index.js .
CMD ["node", "index.js"]