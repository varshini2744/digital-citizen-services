// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB schemas
const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ["user", "admin"], default: "user" },
});

const IdSchema = new mongoose.Schema({
  name: String,
  email: String,
  documentType: String,
  photoPath: String,
  idProofPath: String,
  status: { type: String, enum: ["pending", "approved", "rejected", "reupload"], default: "pending" },
});

const TaxSchema = new mongoose.Schema({
  name: String,
  email: String,
  taxId: String,
  income: Number,
  amount: Number,
  panCardPath: String,
  form16Path: String,
  salarySlipPath: String,
  status: { type: String, enum: ["pending", "approved", "rejected", "reupload"], default: "pending" },
});

const RtoSchema = new mongoose.Schema({
  fullName: String,
  vehicleType: String,
  registrationNumber: String,
  address: String,
  rcPath: String,
  status: { type: String, enum: ["pending", "approved", "rejected", "reupload"], default: "pending" },
});

const UserModel = mongoose.model("User", UserSchema);
const IdModel = mongoose.model("IDApplication", IdSchema);
const TaxModel = mongoose.model("TaxApplication", TaxSchema);
const RtoModel = mongoose.model("RTORegistration", RtoSchema);

// Admin Seeder
async function seedAdminUser() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const existing = await UserModel.findOne({ email: ADMIN_EMAIL });
  if (!existing) {
    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await UserModel.create({ email: ADMIN_EMAIL, password: hashed, role: "admin" });
    console.log(`✅ Admin user created: ${ADMIN_EMAIL}`);
  } else {
    console.log(`ℹ️ Admin user already exists: ${ADMIN_EMAIL}`);
  }
}

// MongoDB connection
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(async () => {
  console.log("✅ Connected to MongoDB Atlas");
  await seedAdminUser();
  app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`🚀 Server running at ${url}`);
    import("open").then(open => open.default(url)).catch(err => console.error("Failed to open browser:", err));
  });
}).catch(err => {
  console.error("❌ MongoDB connection error:", err);
});

// Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_"));
  },
});
const upload = multer({ storage });

// Auth APIs
app.post("/register", async (req, res) => {
  const { email, password, role } = req.body;
  const existing = await UserModel.findOne({ email });
  if (existing) return res.status(409).send("User already exists");
  const hashed = await bcrypt.hash(password, 10);
  await UserModel.create({ email, password: hashed, role: role || "user" });
  res.status(201).send("User registered successfully");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await UserModel.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).send("Invalid email or password");
  }
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ token, role: user.role });
});

// Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send("Missing token");
  const token = authHeader.split(" ")[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).send("Invalid token");
    req.user = decoded;
    next();
  });
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).send("Admins only");
  next();
}

// Form Routes
app.post("/submit-id", upload.fields([{ name: "photo" }, { name: "idProof" }]), async (req, res) => {
  const { name, email, documentType } = req.body;
  const photoPath = req.files?.photo?.[0]?.path || "";
  const idProofPath = req.files?.idProof?.[0]?.path || "";
  await IdModel.create({ name, email, documentType, photoPath, idProofPath });
  res.redirect(`/thankyou.html?name=${encodeURIComponent(name)}`);
});

app.post("/submit-tax", upload.fields([{ name: "panCard" }, { name: "form16" }, { name: "salarySlip" }]), async (req, res) => {
  const { name, email, taxId, income, amount } = req.body;
  const panCardPath = req.files?.panCard?.[0]?.path || "";
  const form16Path = req.files?.form16?.[0]?.path || "";
  const salarySlipPath = req.files?.salarySlip?.[0]?.path || "";
  await TaxModel.create({ name, email, taxId, income, amount, panCardPath, form16Path, salarySlipPath });
  res.redirect(`/thankyou.html?name=${encodeURIComponent(name)}`);
});

app.post("/submit-rto-registration", upload.single("rcDocument"), async (req, res) => {
  const { fullName, vehicleType, registrationNumber, address } = req.body;
  const rcPath = req.file?.path || "";
  await RtoModel.create({ fullName, vehicleType, registrationNumber, address, rcPath });
  res.redirect(`/thankyou.html?name=${encodeURIComponent(fullName)}`);
});

// Admin Status Update
app.patch("/update-status", authMiddleware, adminOnly, async (req, res) => {
  const { id, type, status } = req.body;
  const models = { id: IdModel, tax: TaxModel, rto: RtoModel };
  const model = models[type];
  if (!model) return res.status(400).send("Invalid type");
  await model.findByIdAndUpdate(id, { status });
  res.send("Status updated successfully");
});

// Admin Views
function generateAdminHeader(title) {
  return `<!DOCTYPE html><html><head><title>${title}</title><meta charset="UTF-8"></head><body>`;
}

app.get("/view-id", authMiddleware, adminOnly, async (req, res) => {
  const data = await IdModel.find({});
  let html = generateAdminHeader("ID Applications") +
    `<h2>ID Applications</h2><table border="1"><tr><th>Name</th><th>Email</th><th>Document Type</th><th>Photo</th><th>ID Proof</th><th>Status</th></tr>`;
  data.forEach(app => {
    html += `<tr><td>${app.name}</td><td>${app.email}</td><td>${app.documentType}</td><td><a href="/${app.photoPath}" target="_blank">View</a></td><td><a href="/${app.idProofPath}" target="_blank">View</a></td><td>${app.status}</td></tr>`;
  });
  html += `</table></body></html>`;
  res.send(html);
});

app.get("/view-tax", authMiddleware, adminOnly, async (req, res) => {
  const data = await TaxModel.find({});
  let html = generateAdminHeader("Tax Applications") +
    `<h2>Tax Applications</h2><table border="1"><tr><th>Name</th><th>Email</th><th>Tax ID</th><th>Income</th><th>Amount</th><th>PAN</th><th>Form 16</th><th>Salary Slip</th><th>Status</th></tr>`;
  data.forEach(app => {
    html += `<tr><td>${app.name}</td><td>${app.email}</td><td>${app.taxId}</td><td>${app.income}</td><td>${app.amount}</td><td><a href="/${app.panCardPath}" target="_blank">View</a></td><td><a href="/${app.form16Path}" target="_blank">View</a></td><td><a href="/${app.salarySlipPath}" target="_blank">View</a></td><td>${app.status}</td></tr>`;
  });
  html += `</table></body></html>`;
  res.send(html);
});

app.get("/view-rto", authMiddleware, adminOnly, async (req, res) => {
  const data = await RtoModel.find({});
  let html = generateAdminHeader("RTO Registrations") +
    `<h2>RTO Registrations</h2><table border="1"><tr><th>Full Name</th><th>Vehicle Type</th><th>Registration Number</th><th>Address</th><th>RC Document</th><th>Status</th></tr>`;
  data.forEach(entry => {
    html += `<tr><td>${entry.fullName}</td><td>${entry.vehicleType}</td><td>${entry.registrationNumber}</td><td>${entry.address}</td><td><a href="/${entry.rcPath}" target="_blank">View</a></td><td>${entry.status}</td></tr>`;
  });
  html += `</table></body></html>`;
  res.send(html);
});