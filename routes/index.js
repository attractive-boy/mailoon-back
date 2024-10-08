const router = require('koa-router')()

router.get('/', async (ctx, next) => {
  await ctx.render('index', {
    title: 'Hello Koa 2!'
  })
})

// 获取所有问卷
router.get('/questionnaires', async (ctx) => {
  const questionnaires = await ctx.db('questionnaires').select();
  const results = await Promise.all(questionnaires.map(async (q) => {
    const questions = await ctx.db('questions').where('questionnaire_id', q.id);
    const questionsWithOptions = await Promise.all(questions.map(async (question) => {
      const options = await ctx.db('options').where('question_id', question.id);
      return { ...question, options };
    }));
    return { ...q, questions: questionsWithOptions };
  }));

  ctx.body = results;
});

// POST /questionnaires/:questionnaireId/submit
router.post('/questionnaires/:questionnaireId/submit', async (ctx) => {
  const { questionnaireId } = ctx.params;
  const { answers } = ctx.request.body;

  try {
    // 创建问卷响应
    const [responseId] = await ctx.db('responses').insert({
      user_id: ctx.state.user.userId, // 假设使用 Koa 的身份验证获取用户 id
      questionnaire_id: questionnaireId,
    });

    // 插入答案
    // 使用 Object.entries 遍历对象
    const answerInserts = Object.entries(answers).map(([questionId, selectedOptionId]) => ({
      response_id: responseId,
      question_id: parseInt(questionId),  // 将 questionId 转换为整数
      selected_option_id: selectedOptionId,
    }));
    await ctx.db('answers').insert(answerInserts);

    // 计算结果逻辑
    const ruleRows = await ctx.db('CalculationRules').select('*'); // 获取所有规则
    const results = {};  // 保存每个模块和维度的计算结果

    ruleRows.forEach(rule => {
      const { module_name, dimension_name, question_ids } = rule;
      const questionIds = question_ids;  // 将 question_ids 解析成数组

      // 收集用户为该维度下所有题目选择的选项分数
      const scores = questionIds
        .map(questionId => answers[questionId])   // 获取用户为每个题目选择的选项ID
        .filter(selectedOptionId => selectedOptionId !== undefined); // 过滤掉没有回答的题目

      // 计算该维度下的平均分
      const averageScore = scores.length > 0
        ? scores.reduce((acc, score) => acc + score, 0) / scores.length
        : 0;  // 如果没有回答题目，则平均分为0

      // 初始化模块和维度
      if (!results[module_name]) {
        results[module_name] = {};
      }

      // 保存维度的平均分
      results[module_name][dimension_name] = averageScore;
    });

    // 指定模块的顺序
    const order = ['海底轮', '性轮', '太阳轮', '心轮', '喉轮', '眉心轮', '顶轮'];

    // 按照指定顺序返回结果
    const orderedResults = {};
    order.forEach(module => {
      if (results[module]) {
        orderedResults[module] = results[module];
      }
    });

    // 返回结果
    ctx.body = { success: true, results: orderedResults };
  } catch (err) {
    console.error(err);
    ctx.status = 500;
    ctx.body = { error: 'Internal Server Error' };
  }
});
module.exports = router
