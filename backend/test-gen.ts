import { generateQuestionsFromText } from './src/utils/ai-generator.js';

(async () => {
  try {
    const res = await generateQuestionsFromText({ text: 'The sun is a star.', topicId: 't1', subjectId: 's1' });
    console.log('Success:', res);
  } catch (err) {
    console.error('Caught error:', err);
  }
})();
