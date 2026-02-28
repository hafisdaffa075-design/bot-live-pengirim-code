require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  EmbedBuilder,
  PermissionsBitField,
} = require("discord.js");

const { REST } = require("@discordjs/rest");
const fs = require("fs");

// ===== Environment Variables =====
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const MAX_STOCK = 1000;

if (!TOKEN) {
  console.error("❌ ERROR: TOKEN tidak ditemukan!");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ================= DATABASE =================
function loadDB() {
  if (!fs.existsSync("./database.json")) {
    fs.writeFileSync(
      "./database.json",
      JSON.stringify({ codes: [], totalSent: 0 }, null, 2),
    );
  }
  return JSON.parse(fs.readFileSync("./database.json"));
}

function saveDB(data) {
  try {
    fs.writeFileSync("./database.json", JSON.stringify(data, null, 2));
    console.log(`✅ Database diupdate! Stok saat ini: ${data.codes.length}`);
  } catch (err) {
    console.error("❌ Gagal menulis ke database.json:", err);
  }
}

// ================= AUTO PANEL =================
let lastStock = -1;
let panelMessageId = null;

async function updateStockPanel(forceNew = false) {
  try {
    const db = loadDB();
    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);

    if (!channel) {
      console.error("❌ ERROR: Channel tidak ditemukan!");
      return;
    }

    const currentStock = db.codes.length;
    // Jangan update jika stok sama, kecuali dipaksa (forceNew)
    if (!forceNew && currentStock === lastStock) return;
    lastStock = currentStock;

    const percentage = Math.min(
      Math.round((currentStock / MAX_STOCK) * 100),
      100,
    );
    const totalBars = 20;
    const filledBars = Math.round((percentage / 100) * totalBars);
    const emptyBars = totalBars - filledBars;
    const progressBar = "█".repeat(filledBars) + "░".repeat(emptyBars);

    let status = "🟢 STABLE";
    let color = 0x00ff99;

    if (currentStock === 0) {
      status = "🔴 OUT OF STOCK";
      color = 0xff0000;
    } else if (percentage <= 20) {
      status = "🟡 LOW STOCK";
      color = 0xffcc00;
    }

    const embed = new EmbedBuilder()
      .setTitle("🚀 Stok Live Red Finger")
      .setColor(color)
      .addFields(
        { name: "📦 Available", value: `${currentStock} Code`, inline: true },
        { name: "📤 Total Sent", value: `${db.totalSent} Code`, inline: true },
        { name: "📊 Percentage", value: `${percentage}%`, inline: true },
        { name: "📈 Stock Level", value: `\`${progressBar}\`` },
        { name: "📌 Status", value: `**${status}**` },
      )
      .setFooter({ text: "Mathew Bot Online • AUTO Live" })
      .setTimestamp();

    // Logika /live: Jika forceNew true, buat pesan baru
    if (forceNew || !panelMessageId) {
      const msg = await channel.send({ embeds: [embed] });
      panelMessageId = msg.id;
    } else {
      // Logika normal: Coba edit pesan yang sudah ada
      try {
        const msg = await channel.messages.fetch(panelMessageId);
        await msg.edit({ embeds: [embed] });
      } catch {
        const msg = await channel.send({ embeds: [embed] });
        panelMessageId = msg.id;
      }
    }
  } catch (err) {
    console.error("❌ Gagal mengupdate panel:", err.message);
  }
}

// ================= SLASH COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName("add")
    .setDescription("Tambah banyak code sekaligus")
    .addStringOption((opt) =>
      opt
        .setName("kode")
        .setDescription("Masukkan banyak code")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("kirim")
    .setDescription("Kirim code ke user")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Pilih user").setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt.setName("jumlah").setDescription("Jumlah code"),
    ),
  new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("Update stok manual pada panel yang ada"),
  new SlashCommandBuilder()
    .setName("live")
    .setDescription("Kirim panel stok baru (Gunakan jika panel lama hilang)"),
  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Ambil file database.json terbaru dari server"),
].map((cmd) => cmd.toJSON());

// ================= REGISTER COMMANDS =================
async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("✅ Slash command terdaftar!");
  } catch (err) {
    console.error("❌ Gagal mendaftarkan command:", err.message);
  }
}

registerCommands();

// ================= INTERACTION =================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const db = loadDB();

  // COMMAND: ADD
  if (interaction.commandName === "add") {
    const input = interaction.options.getString("kode");
    const newCodes = input
      .split(/[\n,]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (newCodes.length === 0)
      return interaction.reply({
        content: "❌ Code tidak valid!",
        ephemeral: true,
      });

    db.codes.push(...newCodes);
    saveDB(db);
    await interaction.reply({
      content: `✅ Berhasil menambahkan ${newCodes.length} code!`,
      ephemeral: true,
    });
    await updateStockPanel();
  }

  // COMMAND: KIRIM
  if (interaction.commandName === "kirim") {
    const user = interaction.options.getUser("user");
    const jumlah = interaction.options.getInteger("jumlah") || 1;

    if (db.codes.length < jumlah)
      return interaction.reply({
        content: "❌ Stok tidak cukup!",
        ephemeral: true,
      });

    const codes = db.codes.splice(0, jumlah);
    db.totalSent += jumlah;
    saveDB(db);

    try {
      await user.send(`🎁 **ELITE CODE DELIVERY**\n\n${codes.join("\n")}`);
      await interaction.reply({
        content: `✅ Terkirim ke ${user.tag}`,
        ephemeral: true,
      });
      await updateStockPanel();
    } catch {
      await interaction.reply({
        content: "❌ Gagal kirim DM ke user!",
        ephemeral: true,
      });
    }
  }

  // COMMAND: REFRESH
  if (interaction.commandName === "refresh") {
    if (
      !interaction.memberPermissions.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      return interaction.reply({
        content: "❌ No Permission!",
        ephemeral: true,
      });
    }
    await updateStockPanel();
    await interaction.reply({
      content: "♻️ Panel diperbarui!",
      ephemeral: true,
    });
  }

  // COMMAND: LIVE (PANEL BARU)
  if (interaction.commandName === "live") {
    if (
      !interaction.memberPermissions.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      return interaction.reply({
        content: "❌ No Permission!",
        ephemeral: true,
      });
    }
    await updateStockPanel(true); // Parameter true untuk mengirim pesan baru
    await interaction.reply({
      content: "🚀 Panel stok baru telah dikirim!",
      ephemeral: true,
    });
  }

  // COMMAND: BACKUP
  if (interaction.commandName === "backup") {
    if (
      !interaction.memberPermissions.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      return interaction.reply({
        content: "❌ No Permission!",
        ephemeral: true,
      });
    }
    try {
      await interaction.reply({
        content: "📦 Ini backup database terbaru dari server Railway:",
        files: ["./database.json"],
        ephemeral: true,
      });
    } catch (err) {
      console.error("❌ Gagal mengirim backup:", err);
      await interaction.reply({
        content: "❌ Gagal mengambil file database!",
        ephemeral: true,
      });
    }
  }
});

// ================= READY =================
client.once("ready", () => {
  console.log(`🔥 ${client.user.tag} Online!`);
  updateStockPanel();
});

// ================= LOGIN =================
client.login(TOKEN);
