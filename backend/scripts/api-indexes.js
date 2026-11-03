const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const models = ['Class', 'User', 'Video', 'Document', 'Assignment', 'Announcement', 'Quiz']
  .map((name) => require(`../models/${name}`));

async function main() {
  const apply = process.argv.includes('--apply');
  const explain = process.argv.includes('--explain');
  // Mặc định chỉ in định nghĩa, không kết nối hoặc thay đổi database.
  if (!apply && !explain) {
    console.log(JSON.stringify(models.map((model) => ({ model: model.modelName, indexes: model.schema.indexes() })), null, 2));
    return;
  }
  if (!process.env.MONGODB_URI) throw new Error('Cần cấu hình MONGODB_URI cho database thử nghiệm');
  try {
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
    if (apply) {
      // Chỉ thêm index; không dùng syncIndexes vì có thể xóa index ngoài schema.
      for (const model of models) { await model.createIndexes(); console.log(`Đã tạo index: ${model.modelName}`); }
    }
    if (explain) {
      for (const [model, filter] of [[models[0], {}], [models[1], { deletedAt: null }]]) {
        const plan = await model.find(filter).sort({ createdAt: -1, _id: -1 }).limit(20).lean().explain('executionStats');
        console.log(JSON.stringify({ model: model.modelName, winningPlan: plan.queryPlanner.winningPlan,
          totalDocsExamined: plan.executionStats.totalDocsExamined,
          totalKeysExamined: plan.executionStats.totalKeysExamined, nReturned: plan.executionStats.nReturned }, null, 2));
      }
    }
  } finally { await mongoose.disconnect(); }
}
main().catch((error) => {
  console.error(JSON.stringify({ error: error.name, code: error.code,
    message: 'Không hoàn tất thao tác index. Kiểm tra cấu hình/quyền DB và xung đột index.' }));
  process.exitCode = 1;
});
