FROM node:14 as builder

WORKDIR /src
ENV NODE_ENV "production"
COPY ./packages/engine-server ./
COPY ./yarn.lock ./
RUN yarn install

FROM node:14

WORKDIR /src

COPY --from=builder /src/ /src

ENV NODE_ENV "production"
ENV CONTEMBER_PORT 4000
ENV CONTEMBER_MONITORING_PORT 4001

CMD ["node", "./dist/src/start.js"]
