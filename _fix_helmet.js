const fs = require("fs");
let content = fs.readFileSync("server.js", "utf8");
const oldBlock = ;
const newBlock = "app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));";
if (content.includes(oldBlock)) {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync("server.js", content);
  console.log("FIXED");
} else {
  console.log("NOT_FOUND");
}
