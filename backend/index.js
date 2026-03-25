import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import connectDB from './config/db.js'
import authRoutes from './routes/auth.routes.js'
import eligibilityRoutes from './routes/eligibility.routes.js'
import productsRoute from './routes/products.routes.js'
import mongoose from 'mongoose'
import dashboardRoutes from './routes/dashboard.routes.js'
import paymentRoutes from './routes/payment.routes.js'
import adminBrandRoutes from './routes/admin.brand.routes.js'
import ristaHealthRoutes from './routes/rista.health.routes.js'
import ristaRoutes from "./routes/rista.routes.js";
import analyticsRoutes from './routes/analytics.routes.js'
import brandSettingsRoutes from "./routes/brand.settings.routes.js";
import brandProfileRoutes from "./routes/brand.profile.routes.js";
import meetingRoutes from './routes/meeting.routes.js'
import stockRoutes from "./routes/stock.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import vendorEligibilityRoutes from"./routes/vendorEligibility.routes.js"
import servicesRoutes from "./routes/services.routes.js"
import inventoryRoutes from "./routes/inventory.routes.js";
import minimumPackageRoutes from "./routes/minimumPackage.routes.js";
import mappedIngredientsRoutes from "./routes/mappedIngredients.routes.js";
import mainRecipeRoutes from "./routes/mainrecipe.routes.js";
import subRecipeRoutes from "./routes/subrecipe.routes.js";
import costingsRoutes from "./routes/costing.routes.js";
import orderRoutes from "./routes/order.routes.js";
import googleRoutes from "./routes/google.routes.js";
import { validateEnv } from "./utils/envValidator.js";
import trialTrainingRecipeRoutes from "./routes/trialTrainingRecipes.routes.js";
import ingredientIndentRoutes from "./routes/ingredientIndent.routes.js";
import recipeHierarchyRoutes from "./routes/recipeHierarchy.routes.js";
import creditNoteRoutes from "./routes/creditNote.routes.js";
import menuEntryRoutes from "./routes/menuEntry.routes.js";
import brandStockRoutes from "./routes/brandStock.routes.js";

dotenv.config()
validateEnv();
connectDB()

const app = express()
const server = http.createServer(app);

const rawOrigins =
  process.env.CLIENT_ORIGIN ||
  "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,https://sk-peach-two.vercel.app";

const allowedOrigins = rawOrigins
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  // Clients join their own room so server can emit targeted wallet updates.
  socket.on("join:user", (userId) => {
    if (userId) socket.join(String(userId));
  });
});

app.set("io", io);

app.use(
  cors({
    origin: [
      "https://sk-peach-two.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    credentials: true,
    methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    allowedHeaders: "Content-Type,Authorization,Accept,X-Requested-With"
  })
);

// explicitly handle preflight
app.options("*", cors());







app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/', (req, res) => {
  res.send('Server is running')
})

app.use('/api/auth', authRoutes)
app.use('/api/eligibility', eligibilityRoutes)
app.use('/api/products', productsRoute)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/payment', paymentRoutes)
app.use('/api/admin', adminBrandRoutes)
app.use('/api/rista', ristaHealthRoutes)
app.use("/api/rista", ristaRoutes);
app.use('/api/analytics', analyticsRoutes)
app.use("/api/brand", brandSettingsRoutes);
app.use("/api/brand", brandProfileRoutes);
app.use('/api/meeting', meetingRoutes)
app.use("/api", stockRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/vendor-eligibility", vendorEligibilityRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/minimumpackage", minimumPackageRoutes);
app.use("/api/mapped-ingredients", mappedIngredientsRoutes);
app.use("/api/mainrecipes", mainRecipeRoutes);
app.use("/api/subrecipes", subRecipeRoutes);
app.use("/api/costing", costingsRoutes);
app.use("/api", orderRoutes);
app.use("/api", trialTrainingRecipeRoutes);
app.use("/api/ingredient-indent", ingredientIndentRoutes);
app.use("/api", recipeHierarchyRoutes);
app.use("/api/credit-notes", creditNoteRoutes);
app.use("/api", menuEntryRoutes);
app.use("/api", brandStockRoutes);
app.use("/api/google", googleRoutes);

app.get("/debug/db", async (req, res) => {
  const dbName = mongoose.connection.db.databaseName;
  const collections = await mongoose.connection.db
    .listCollections()
    .toArray();

  res.json({
    database: dbName,
    collections: collections.map(c => c.name)
  });
});

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
})
