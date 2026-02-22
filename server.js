const express = require("express");
const app = express();

// Endpoint root
app.get("/", (req, res) => {
  res.send("Bot masih online!");
});

// Gunakan PORT dari Railway, atau default 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
