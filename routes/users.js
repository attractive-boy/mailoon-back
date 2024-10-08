const router = require('koa-router')()
const axios = require('axios')
const WECHAT_APPID = 'wx4e22a2efdf4efb81';  // 替换为你的小程序 AppID
const WECHAT_SECRET = '27b2691557cef0804035dd574c94bcb7'; // 替换为你的小程序 AppSecret
const jsonwebtoken = require('jsonwebtoken');
// JWT secret
const secret = `faU5Xpb~qxcp6Zv68Q
sLR1)q9m#yTH)e96)
hJIb^Q8PoGq8O4FNRZh
AtIb2AWs7)!OXj0Ip!h
1bazvKTjiiFh6gxU)v9y`;

router.post('/login', async (ctx, next) => {
  const { username, password  } = ctx.request.body
})

router.post('/miniprogrameLogin', async (ctx, next) => {
  const { code } = ctx.request.body;
  const { data } = await axios.get(`https://api.weixin.qq.com/sns/jscode2session?appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}&js_code=${code}&grant_type=authorization_code`);

  // 查看 openid 在数据库中是否已经存在
  const user = await ctx.db.select('*').from('users').where({ openid: data.openid });

  let userData;
  if (user.length) {
    userData = user[0];
  } else {
    // 插入数据库
    const newUser = await ctx.db.insert({
      openid: data.openid
    }).into('users');

    userData = newUser;
  }

  // 生成 JWT
  const token = jsonwebtoken.sign({ userId: userData.id }, secret, { expiresIn: '1h' });

  ctx.body = {
    code: 200,
    data: {
      user: userData,
      token: token
    }
  };
});

router.post('/registerUser', async (ctx, next) => {
  const { nickName, avatarUrl } = ctx.request.body;
  //根据jwt获取用户
  const user = await ctx.db.select('*').from('users').where({ id: ctx.state.user.userId });
  if (user.length) {
    await ctx.db('users').where({ id: ctx.state.user.userId }).update({
      nickname: nickName,
      avatar_url: avatarUrl
    });
    ctx.body = {
      code: 200,
      data: {
        user: user
      }
    };
  } else {
    ctx.body = {
      code: 400,
      data: {
        message: '用户不存在'
     }
    }
  }
})

router.post('/uploadAvatar', async (ctx, next) => {
  // 获取上传的文件
  const file = ctx.request.files.avatar;

  if (!file) {
    ctx.status = 400;
    ctx.body = { message: 'No file uploaded!' };
    return;
  }

  // 文件的存储路径
  const filePath = '/api/uploads/' + file.newFilename;
  ctx.body = { filePath };
})

module.exports = router
