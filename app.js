const Koa = require('koa');
const app = new Koa();
const views = require('koa-views');
const json = require('koa-json');
const onerror = require('koa-onerror');
const bodyparser = require('koa-bodyparser');
const logger = require('koa-logger');
const jwt = require('koa-jwt');
const jsonwebtoken = require('jsonwebtoken');
const knex = require('knex');
const knexConfig = require('./knexfile'); // 引入knex配置
const { koaBody } = require('koa-body');
const path = require('path');
const fs = require('fs');


const index = require('./routes/index')
const users = require('./routes/users')

// JWT secret
const secret = `faU5Xpb~qxcp6Zv68Q
sLR1)q9m#yTH)e96)
hJIb^Q8PoGq8O4FNRZh
AtIb2AWs7)!OXj0Ip!h
1bazvKTjiiFh6gxU)v9y`;


// 配置koa-body中间件，支持多部分（multipart/form-data）表单数据
app.use(koaBody({
  multipart: true,
  formidable: {
    // 上传目录
    uploadDir: path.join(__dirname, '/uploads'),
    // 保留文件扩展名
    keepExtensions: true,
    maxFileSize: 2 * 1024 * 1024, // 设置上传文件大小限制，默认2MB
  }
}));

// JWT 中间件（忽略一些公开的路径，如登录和注册）
app.use(jwt({ secret }).unless({
  path: [/^\/login/,/^\/miniprogrameLogin/,/^\/uploadAvatar/]  // 登录和注册等接口不需要token鉴权
}));

// error handler
onerror(app)

// 初始化 knex 实例
const db = knex(knexConfig);

// middlewares
app.use(bodyparser({
  enableTypes:['json', 'form', 'text']
}))
app.use(json())
app.use(logger())
app.use(require('koa-static')(__dirname + '/public'))


app.use(views(__dirname + '/views', {
  extension: 'pug'
}))

// 将 knex 添加到 ctx
app.use(async (ctx, next) => {
  ctx.db = db;  // 将 knex 实例挂载到 ctx.db 上
  await next();
});

// logger
app.use(async (ctx, next) => {
  const start = new Date()
  await next()
  const ms = new Date() - start
  console.log(`${ctx.method} ${ctx.url} - ${ms}ms`)
})

// routes
app.use(index.routes(), index.allowedMethods())
app.use(users.routes(), users.allowedMethods())

// error-handling
app.on('error', (err, ctx) => {
  console.error('server error', err, ctx)
});

module.exports = app
