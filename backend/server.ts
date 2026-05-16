import express from "express";

const app = express();
app.use(express.json());

const connectors = [
  { id: "aws-redshift", label: "AWS Redshift" },
  { id: "azure-synapse", label: "Azure Synapse" },
  { id: "snowflake", label: "Snowflake" },
  { id: "google-bigquery", label: "Google BigQuery" },
  { id: "postgresql", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
  { id: "sql-server", label: "SQL Server" },
  { id: "oracle", label: "Oracle" },
  { id: "mongodb", label: "MongoDB" },
  { id: "databricks", label: "Databricks" },
];

const sampleDataMap: Record<string, any[]> = {
  "aws-redshift": [
    { id: 1, account_name: "Sales Corp", region: "us-east-1", revenue: 125000.5, status: "active" },
    { id: 2, account_name: "Green Labs", region: "us-west-2", revenue: 98000, status: "inactive" },
    { id: 3, account_name: "Blue Ribbon", region: "eu-central-1", revenue: 143500, status: "active" }
  ],
  "azure-synapse": [
    { id: 1, project: "Analytics Pipeline", owner: "Diana", status: "running", nodes: 8 },
    { id: 2, project: "Q2 Forecast", owner: "Mason", status: "completed", nodes: 12 }
  ],
  "snowflake": [
    { id: 1, customer: "Acme", orders: 62, total_spend: 18320.75, last_order: "2026-05-10" },
    { id: 2, customer: "Horizon", orders: 47, total_spend: 12790, last_order: "2026-05-12" }
  ],
  "default": [
    { id: 1, name: "Sample Row 1", value: 100, category: "A" },
    { id: 2, name: "Sample Row 2", value: 200, category: "B" },
    { id: 3, name: "Sample Row 3", value: 150, category: "A" }
  ]
};

function getSampleData(connectorId: string) {
  return sampleDataMap[connectorId] || sampleDataMap["default"];
}

app.get("/api/connectors", (req, res) => {
  res.json({ connectors });
});

app.post("/api/db/preview", (req, res) => {
  const { connector } = req.body;
  const data = getSampleData(connector);
  res.json({ data });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Database connector mock server running on http://localhost:${port}`);
});
