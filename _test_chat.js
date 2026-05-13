const { initDB } = require('./services/db');
const { chatWithAI } = require('./services/essay-grader');
initDB();
chatWithAI('My favorite season is spring.', {title:'Test'}, null, null, null, [], 'Why is this wrong?')
  .then(r => { console.log('OK'); console.log(r.substring(0, 100)); })
  .catch(e => { console.log('ERR: ' + e.message); });
