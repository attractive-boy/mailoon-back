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
    ctx.body = { success: true, results: orderedResults, responseId };
  } catch (err) {
    console.error(err);
    ctx.status = 500;
    ctx.body = { error: 'Internal Server Error' };
  }
});

router.get('/consultation/:id', async (ctx, next) => {
  const consultationId = ctx.params.id;

  try {
    const consultationQuery = ctx.db
      .select('*')
      .from('zxquestionnaire')
      .where({ id: consultationId });

    const consultation = await consultationQuery;

    if (!consultation.length) {
      ctx.body = {
        code: 404,
        message: '咨询单未找到'
      };
      return;
    }

    const questionnaireId = consultation[0].id;

    const questionsQuery = await ctx.db
      .select('zq.id as question_id', 'zq.question_text', 'zq.type', 'zqo.option_label', 'zqo.option_value')
      .from('zxquestions as zq')
      .leftJoin('zxquestion_options as zqo', 'zq.id', 'zqo.question_id')
      .where({ questionnaire_id: questionnaireId });

    // 将问题和选项组织成合理的结构
    const questionsMap = {};

    questionsQuery.forEach(question => {
      if (!questionsMap[question.question_id]) {
        questionsMap[question.question_id] = {
          question_id: question.question_id,
          question_text: question.question_text,
          type: question.type,
          options: []
        };
      }
      if (question.option_label && question.option_value) {
        questionsMap[question.question_id].options.push({
          option_label: question.option_label,
          option_value: question.option_value
        });
      }
    });

    const responseData = {
      consultation: consultation[0],
      questions: Object.values(questionsMap)
    };

    ctx.body = {
      code: 200,
      data: responseData
    };
  } catch (error) {
    console.error(error);
    ctx.body = {
      code: 500,
      message: error.message
    };
  }
});


// POST /submit_consultation
router.post('/submit_consultation', async (ctx) => {
  const { answers, responseId } = ctx.request.body;

  // 验证请求体
  if (!answers || !responseId) {
    ctx.status = 400;
    ctx.body = { message: '缺少必要的参数：answers 或 responseId' };
    return;
  }

  try {
    // 获取用户ID（假设通过身份验证中间件设置在 ctx.state.user.userId）
    const userId = ctx.state.user.userId;

    // 获取与 responseId 关联的响应记录
    const response = await ctx.db('responses').where({ id: responseId }).first();

    if (!response) {
      ctx.status = 404;
      ctx.body = { message: 'Response not found' };
      return;
    }

    const questionnaireId = 1;

    // 确认 questionnaire_id 存在于 zxquestionnaire 表中
    const questionnaire = await ctx.db('zxquestionnaire').where({ id: questionnaireId }).first();

    if (!questionnaire) {
      ctx.status = 400;
      ctx.body = { message: `Questionnaire with id ${questionnaireId} does not exist` };
      return;
    }

    // 准备插入 zxuser_answers 的数据
    const answerInserts = [];

    for (const [questionId, answerValue] of Object.entries(answers)) {
      if (Array.isArray(answerValue)) {
        // 多选题，每个选项作为单独的记录插入
        answerValue.forEach((value) => {
          // 跳过空值
          if (value === null || value === undefined || value === '') return;

          answerInserts.push({
            user_id: userId,
            questionnaire_id: questionnaireId,
            question_id: parseInt(questionId, 10),
            answer_value: value,
            response_id: responseId,
            created_at: new Date(),
            updated_at: new Date(),
          });
        });
      } else {
        // 单选题或输入题，单独插入
        // 跳过空值
        if (answerValue === null || answerValue === undefined || answerValue === '') continue;

        answerInserts.push({
          user_id: userId,
          questionnaire_id: questionnaireId,
          question_id: parseInt(questionId, 10),
          answer_value: answerValue,
          response_id: responseId,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }

    if (answerInserts.length === 0) {
      ctx.status = 400;
      ctx.body = { message: '没有有效的答案可提交' };
      return;
    }

    // 使用事务批量插入答案
    await ctx.db.transaction(async (trx) => {
      await trx('zxuser_answers').insert(answerInserts);
    });

    ctx.status = 200;
    ctx.body = { code:200, message: 'Answers submitted successfully' };
  } catch (error) {
    console.error('Error submitting answers:', error);
    ctx.status = 500;
    ctx.body = { message: 'Internal server error' };
  }
});


module.exports = router
