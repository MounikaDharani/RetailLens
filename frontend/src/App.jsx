
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import {
  getRetailLensData,
  processCsvUpload,
} from "./api";

import "./App.css";

// ============================================================
// RETAILLENS - RETAIL SALES ANALYTICS
// React + AWS Lambda + Amazon S3
// ============================================================

// ------------------------------------------------------------
// 1. SAMPLE DASHBOARD DATA
// ------------------------------------------------------------

const sampleSales = [
  { month: "Jan", sales: 12000 },
  { month: "Feb", sales: 18500 },
  { month: "Mar", sales: 15000 },
  { month: "Apr", sales: 24000 },
  { month: "May", sales: 21000 },
  { month: "Jun", sales: 29000 },
];

const sampleKPIs = [
  { title: "Total Sales", value: "₹1,19,500", icon: "₹" },
  { title: "Total Orders", value: "1,240", icon: "🛍️" },
  { title: "Units Sold", value: "3,680", icon: "📦" },
  { title: "Products", value: "86", icon: "🏷️" },
];

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

// ------------------------------------------------------------
// 2. HELPER FUNCTIONS FOR AWS RESPONSE DATA
// ------------------------------------------------------------

function getArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(([name, amount]) => ({
      name,
      sales: Number(amount) || 0,
    }));
  }

  return [];
}

function normalizeMonthlySales(value) {
  return getArray(value).map((item) => ({
    month:
      item.month ||
      item.Month ||
      item.name ||
      item.date ||
      "Unknown",

    sales: Number(
      item.sales ??
      item.totalSales ??
      item.revenue ??
      item.value ??
      0
    ),
  }));
}

function normalizeCategorySales(value) {
  return getArray(value).map((item) => ({
    name:
      item.category ||
      item.Category ||
      item.name ||
      item.label ||
      "Unknown",

    sales: Number(
      item.sales ??
      item.totalSales ??
      item.revenue ??
      item.value ??
      0
    ),
  }));
}

function normalizeRegionalSales(value) {
  return getArray(value).map((item) => ({
    name:
      item.region ||
      item.Region ||
      item.name ||
      item.label ||
      "Unknown",

    sales: Number(
      item.sales ??
      item.totalSales ??
      item.revenue ??
      item.value ??
      0
    ),
  }));
}

// ------------------------------------------------------------
// 3. MAIN APPLICATION
// ------------------------------------------------------------

function App() {

  // CSV file states
  const [selectedFile, setSelectedFile] = useState(null);
  const [validRecordCount, setValidRecordCount] = useState(0);

  // AWS backend states
  const [backendData, setBackendData] = useState(null);
  const [backendStatus, setBackendStatus] = useState("Connecting...");
  const [backendError, setBackendError] = useState("");

  // Upload and processing states
  const [isUploading, setIsUploading] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [processingError, setProcessingError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  // Actual AWS analytics
  const [awsResults, setAwsResults] = useState(null);
  const [awsProfile, setAwsProfile] = useState(null);
  const [inputKey, setInputKey] = useState("");

  // ----------------------------------------------------------
  // 4. CHECK AWS BACKEND HEALTH
  // ----------------------------------------------------------

  useEffect(() => {
    async function connectToBackend() {
      try {
        setBackendStatus("Connecting...");

        const data = await getRetailLensData();

        console.log("AWS Backend Response:", data);

        setBackendData(data);
        setBackendStatus("AWS Backend Connected");
        setBackendError("");

      } catch (error) {
        console.error("Backend connection failed:", error);

        setBackendError(error.message);
        setBackendStatus("Backend Unavailable");
      }
    }

    connectToBackend();
  }, []);

  // ----------------------------------------------------------
  // 5. VALIDATE CSV FILE
  // ----------------------------------------------------------

  function validateCsv(file) {
    return new Promise((resolve, reject) => {

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,

        transformHeader: (header) => header.trim(),

        complete: (results) => {

          const requiredColumns = [
            "Date",
            "OrderID",
            "Product",
            "Quantity",
            "UnitPrice",
          ];

          const headers = results.meta.fields || [];

          const missingColumns = requiredColumns.filter(
            (column) => !headers.includes(column)
          );

          if (missingColumns.length > 0) {
            reject(
              new Error(
                `Missing columns: ${missingColumns.join(", ")}`
              )
            );
            return;
          }

          const rows = results.data || [];
          const invalidRows = [];

          rows.forEach((row, index) => {

            const dateText = String(row.Date || "").trim();
            const orderId = String(row.OrderID || "").trim();
            const product = String(row.Product || "").trim();

            const quantity = Number(row.Quantity);
            const unitPrice = Number(row.UnitPrice);

            // Timezone-safe date validation
            const dateParts =
              /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);

            let validDate = false;

            if (dateParts) {
              const year = Number(dateParts[1]);
              const month = Number(dateParts[2]);
              const day = Number(dateParts[3]);

              const parsedDate = new Date(
                Date.UTC(year, month - 1, day)
              );

              validDate =
                parsedDate.getUTCFullYear() === year &&
                parsedDate.getUTCMonth() + 1 === month &&
                parsedDate.getUTCDate() === day;
            }

            // Validate required values
            if (
              !validDate ||
              !orderId ||
              !product ||
              !Number.isFinite(quantity) ||
              quantity <= 0 ||
              !Number.isFinite(unitPrice) ||
              unitPrice < 0
            ) {
              invalidRows.push(index + 2);
            }
          });

          if (invalidRows.length > 0) {
            reject(
              new Error(
                `Invalid CSV rows: ${invalidRows
                  .slice(0, 8)
                  .join(", ")}${
                  invalidRows.length > 8 ? ", ..." : ""
                }. Check dates, IDs, products, quantities and prices.`
              )
            );
            return;
          }

          if (rows.length === 0) {
            reject(
              new Error("The CSV contains no sales records.")
            );
            return;
          }

          resolve(rows.length);
        },

        error: () => {
          reject(
            new Error("Unable to read this CSV file.")
          );
        },
      });
    });
  }

  // ----------------------------------------------------------
  // 6. UPLOAD CSV AND START AWS PROCESSING
  // ----------------------------------------------------------

  async function handleFileChange(event) {

    const file = event.target.files?.[0];

    if (!file) return;

    // Reset previous results
    setSelectedFile(null);
    setValidRecordCount(0);

    setAwsResults(null);
    setAwsProfile(null);
    setInputKey("");

    setUploadSuccess("");
    setProcessingError("");
    setProcessingMessage("");

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setProcessingError("Please select a CSV file.");
      event.target.value = "";
      return;
    }

    if (isUploading) {
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
    setIsUploading(true);

    try {

      // STEP 1: Validate CSV locally
      setProcessingMessage("Validating CSV data...");

      const recordCount = await validateCsv(file);

      setValidRecordCount(recordCount);

      // STEP 2: Upload and process through AWS
      const result = await processCsvUpload(
        file,
        (progress) => {
          setProcessingMessage(
            progress.message || "Processing your dataset..."
          );
        }
      );

      console.log("Complete AWS Processing Response:", result);

      // STEP 3: Store actual AWS results
      setAwsResults(result.results || result);
      setAwsProfile(result.profile || null);
      setInputKey(result.inputKey || "");

      setUploadSuccess(
        `AWS processing completed successfully! ${recordCount} records processed.`
      );

      setProcessingMessage("AWS processing completed!");

    } catch (error) {

      console.error("CSV processing failed:", error);

      setProcessingError(error.message);
      setProcessingMessage("");

    } finally {

      setIsUploading(false);
      event.target.value = "";

    }
  }

  // ----------------------------------------------------------
  // 7. EXTRACT ACTUAL AWS ANALYTICS
  // ----------------------------------------------------------

  const analytics = awsResults || {};

  const metrics = useMemo(() => {

    if (!awsResults) return null;

    return {
      totalSales:
        analytics.totalSales ??
        analytics.total_sales ??
        analytics.totalRevenue ??
        0,

      totalOrders:
        analytics.totalOrders ??
        analytics.orders ??
        analytics.total_orders ??
        0,

      unitsSold:
        analytics.totalUnits ??
        analytics.unitsSold ??
        analytics.units ??
        0,

      products:
        analytics.uniqueProducts ??
        analytics.totalProducts ??
        analytics.products ??
        0,
    };

  }, [awsResults]);

  // ----------------------------------------------------------
  // 8. PREPARE KPI CARDS
  // ----------------------------------------------------------

  const kpis = metrics
    ? [
        {
          title: "Total Sales",
          value: money(metrics.totalSales),
          icon: "₹",
        },
        {
          title: "Total Orders",
          value: Number(metrics.totalOrders).toLocaleString("en-IN"),
          icon: "🛍️",
        },
        {
          title: "Units Sold",
          value: Number(metrics.unitsSold).toLocaleString("en-IN"),
          icon: "📦",
        },
        {
          title: "Products",
          value: Number(metrics.products).toLocaleString("en-IN"),
          icon: "🏷️",
        },
      ]
    : sampleKPIs;

  // ----------------------------------------------------------
  // 9. MONTHLY SALES CHART
  // ----------------------------------------------------------

  const monthlyChartData = useMemo(() => {

    if (!awsResults) return sampleSales;

    return normalizeMonthlySales(
      analytics.monthlySales ||
      analytics.monthly_sales
    );

  }, [awsResults, analytics]);

  // ----------------------------------------------------------
  // 10. CATEGORY SALES CHART
  // ----------------------------------------------------------

  const categoryChartData = useMemo(() => {

    if (!awsResults) return [];

    return normalizeCategorySales(
      analytics.categorySales ||
      analytics.salesByCategory ||
      analytics.category_sales
    );

  }, [awsResults, analytics]);

  // ----------------------------------------------------------
  // 11. REGIONAL SALES CHART
  // ----------------------------------------------------------

  const regionalChartData = useMemo(() => {

    if (!awsResults) return [];

    return normalizeRegionalSales(
      analytics.regionalSales ||
      analytics.regionalPerformance ||
      analytics.regional_sales
    );

  }, [awsResults, analytics]);

  // ----------------------------------------------------------
  // 12. DASHBOARD UI
  // ----------------------------------------------------------

  return (
    <div className="app">

      {/* HEADER */}
      <header className="topbar">

        <div className="brand">

          <div className="brand-icon">R</div>

          <div>
            <h1>RetailLens</h1>
            <p>Retail Sales Analytics</p>
          </div>

        </div>

        <div className="status">

          <span
            className="status-dot"
            style={{
              background: backendData ? "#16a34a" : "#f59e0b",
            }}
          />

          {backendStatus}

        </div>

      </header>

      <main className="dashboard">

        {/* BACKEND STATUS */}
        {backendError && (
          <p role="alert" style={{ color: "#dc2626" }}>
            AWS Backend Error: {backendError}
          </p>
        )}

        {backendData && (
          <p style={{ color: "#15803d" }}>
            ✓ Connected to RetailLens AWS Backend
          </p>
        )}

        {/* WELCOME */}
        <section className="welcome">

          <div>
            <p className="eyebrow">OVERVIEW</p>

            <h2>Retail Performance Dashboard</h2>

            <p className="subtitle">
              Understand your sales performance at a glance.
            </p>
          </div>

          <div className="date-label">
            {awsResults
              ? "Live AWS Analytics"
              : "Sample Data · Jan–Jun"}
          </div>

        </section>

        {/* KPI CARDS */}
        <section className="kpi-grid">

          {kpis.map((kpi) => (

            <article className="kpi-card" key={kpi.title}>

              <div className="kpi-top">

                <span className="kpi-title">
                  {kpi.title}
                </span>

                <span className="kpi-icon">
                  {kpi.icon}
                </span>

              </div>

              <h3>{kpi.value}</h3>

              <p className="kpi-note">
                {awsResults
                  ? "Generated by AWS Processing Lambda"
                  : "Illustrative sample value"}
              </p>

            </article>

          ))}

        </section>

        {/* MAIN CONTENT */}
        <section className="content-grid">

          {/* MONTHLY SALES */}
          <article className="panel chart-panel">

            <div className="panel-heading">

              <div>
                <h3>Monthly Sales</h3>
                <p>Sales revenue grouped by month</p>
              </div>

              <span className="chart-badge">
                {awsResults ? "AWS Data" : "Sample Data"}
              </span>

            </div>

            <div className="chart-container">

              <ResponsiveContainer width="100%" height="100%">

                <BarChart data={monthlyChartData}>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e9ebf2"
                  />

                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#777d91", fontSize: 12 }}
                  />

                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#777d91", fontSize: 12 }}
                    tickFormatter={(value) =>
                      `₹${Number(value) / 1000}k`
                    }
                  />

                  <Tooltip
                    formatter={(value) => [
                      money(value),
                      "Sales",
                    ]}
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid #e9ebf2",
                    }}
                  />

                  <Bar
                    dataKey="sales"
                    fill="#635bdb"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>

          </article>

          {/* CSV UPLOAD */}
          <article className="panel upload-panel">

            <div className="panel-heading">

              <div>
                <h3>Upload Sales Data</h3>
                <p>Upload a CSV for AWS-powered analytics</p>
              </div>

            </div>

            <label
              className="upload-area"
              htmlFor="csv-upload"
              style={{
                opacity: isUploading ? 0.6 : 1,
                cursor: isUploading ? "not-allowed" : "pointer",
              }}
            >

              <div className="upload-icon">↑</div>

              <strong>
                {isUploading
                  ? "Processing your dataset..."
                  : "Select your CSV file"}
              </strong>

              <span>
                Click here to browse your computer
              </span>

              <span className="file-type">
                CSV files only
              </span>

              <input
                id="csv-upload"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                disabled={isUploading}
              />

            </label>

            {/* SELECTED FILE */}
            {selectedFile && (
              <div className="selected-file">

                <span>📄</span>

                <div className="file-details">

                  <strong>{selectedFile.name}</strong>

                  <span>
                    {(selectedFile.size / 1024).toFixed(1)} KB
                    {validRecordCount > 0
                      ? ` · ${validRecordCount} records`
                      : ""}
                  </span>

                </div>

              </div>
            )}

            {/* PROCESSING STATUS */}
            {isUploading && (
              <p role="status" style={{ color: "#635bdb" }}>
                ⏳ {processingMessage}
              </p>
            )}

            {/* ERROR */}
            {processingError && (
              <p role="alert" style={{ color: "#dc2626" }}>
                {processingError}
              </p>
            )}

            {/* SUCCESS */}
            {uploadSuccess && (
              <p role="status" style={{ color: "#15803d" }}>
                ✓ {uploadSuccess}
              </p>
            )}

            {/* S3 INPUT KEY */}
            {inputKey && (
              <p style={{ fontSize: "12px", color: "#777d91" }}>
                S3 Input: {inputKey}
              </p>
            )}

            <div className="upload-note">

              <span>ⓘ</span>

              <p>
                Your CSV is uploaded to Amazon S3, processed
                through AWS Lambda and analysed results are
                retrieved automatically.
              </p>

            </div>

          </article>

        </section>

        {/* CATEGORY SALES */}
        {categoryChartData.length > 0 && (

          <section
            className="panel chart-panel"
            style={{ marginTop: "24px" }}
          >

            <div className="panel-heading">

              <div>
                <h3>Sales by Category</h3>
                <p>Category-wise revenue from AWS analytics</p>
              </div>

            </div>

            <div className="chart-container">

              <ResponsiveContainer width="100%" height="100%">

                <BarChart data={categoryChartData}>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e9ebf2"
                  />

                  <XAxis dataKey="name" />
                  <YAxis />

                  <Tooltip
                    formatter={(value) => money(value)}
                  />

                  <Bar
                    dataKey="sales"
                    fill="#16a085"
                    radius={[6, 6, 0, 0]}
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>

          </section>

        )}

        {/* REGIONAL PERFORMANCE */}
        {regionalChartData.length > 0 && (

          <section
            className="panel chart-panel"
            style={{ marginTop: "24px" }}
          >

            <div className="panel-heading">

              <div>
                <h3>Regional Performance</h3>
                <p>Revenue across different regions</p>
              </div>

            </div>

            <div className="chart-container">

              <ResponsiveContainer width="100%" height="100%">

                <BarChart data={regionalChartData}>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e9ebf2"
                  />

                  <XAxis dataKey="name" />
                  <YAxis />

                  <Tooltip
                    formatter={(value) => money(value)}
                  />

                  <Bar
                    dataKey="sales"
                    fill="#e59a36"
                    radius={[6, 6, 0, 0]}
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>

          </section>

        )}

        {/* DATASET PROFILING */}
        {awsProfile && (

          <section
            className="panel"
            style={{
              marginTop: "24px",
              padding: "24px",
            }}
          >

            <div className="panel-heading">

              <div>
                <h3>Dataset Profiling</h3>
                <p>
                  Profiling report generated by AWS Lambda
                </p>
              </div>

              <span className="chart-badge">
                AWS Profile
              </span>

            </div>

            <pre
              style={{
                whiteSpace: "pre-wrap",
                overflowX: "auto",
                fontSize: "12px",
                lineHeight: 1.6,
                background: "#f7f8fc",
                padding: "16px",
                borderRadius: "10px",
                maxHeight: "420px",
                overflowY: "auto",
              }}
            >
              {JSON.stringify(awsProfile, null, 2)}
            </pre>

          </section>

        )}

        {/* FOOTER */}
        <footer className="footer">

          <span>
            RetailLens · Retail Sales Analytics
          </span>

          <span>
            {awsResults
              ? `${validRecordCount} records processed by AWS`
              : "CSV Analytics · AWS Connected"}
          </span>

        </footer>

      </main>

    </div>
  );
}

export default App;
