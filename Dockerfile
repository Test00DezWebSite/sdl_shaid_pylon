FROM mhart/alpine-node:6.9.1

RUN apk add --update bash && rm -rf /var/cache/apk/*

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install

COPY . /usr/src/app/

EXPOSE 3000 10101

CMD ["node", "index.js"]