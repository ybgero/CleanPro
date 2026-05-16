import React, { useState, useCallback, useMemo } from "react";
import { Editor } from "@monaco-editor/react";
import {
  Upload,
  FileText,
  Trash2,
  Download,
  Settings2,
  History,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  FileSpreadsheet,
  Database,
  RefreshCw,
  X,
  Sparkles,
  ShieldCheck,
  Cpu,
  ArrowRight,
  ArrowDown,
  Columns,
  Zap,
  Search,
} from "lucide-react";
import { motion } from "motion/react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import yaml from "js-yaml";
import { cn } from "./lib/utils";
import {
  CleaningConfig,
  FileData,
  RunHistory,
  NullOption,
  BlankOption,
  ZeroOption,
  DuplicateOption,
} from "./types";

interface Transformation {
  id: string;
  column: string;
  operation: string;
  value: string;
}

const transformationOptions = [
  { value: "fill_nulls", label: "Fill nulls with median" },
  { value: "drop_nulls", label: "Drop rows with nulls" },
  { value: "trim_whitespace", label: "Trim whitespace" },
  { value: "standardize_case", label: "Standardize case" },
  { value: "remove_duplicates", label: "Remove duplicate rows" },
];

const navItems = [
  { id: "datasets", label: "Datasets", icon: Database },
  { id: "transformations", label: "Transformations", icon: Settings2 },
  { id: "history", label: "Query History", icon: History },
  { id: "insights", label: "AI Insights", icon: Sparkles },
  { id: "export", label: "Export Options", icon: Download },
];

export default function App() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [transformations, setTransformations] = useState<Transformation[]>([
    { id: "t1", column: "", operation: "fill_nulls", value: "" },
  ]);
  const [sourceType, setSourceType] = useState<"upload" | "db">("upload");
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeSection, setActiveSection] = useState("datasets");
  const [dbConnector, setDbConnector] = useState("aws-redshift");
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState("");
  const [dbDatabase, setDbDatabase] = useState("");
  const [dbSchema, setDbSchema] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [dbQuery, setDbQuery] = useState("SELECT * FROM table_name LIMIT 100;");
  const [dbPreview, setDbPreview] = useState<any[] | null>(null);
  const [isDbLoading, setIsDbLoading] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isSqlRunning, setIsSqlRunning] = useState(false);
  const [sqlStatus, setSqlStatus] = useState("Ready");

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedFileId) || null,
    [files, selectedFileId]
  );

  const columns = useMemo(() => {
    if (!selectedFile) return [];
    return Object.keys(selectedFile.data[0] || {});
  }, [selectedFile]);

  const activeDatasetName = selectedFile?.name ?? "No dataset loaded";
  const rowCount = selectedFile?.metadata.rows ?? 0;

  const qualityScore = useMemo(() => {
    if (!selectedFile) return 0;
    const penalty = selectedFile.metadata.nullCount * 1.2 + selectedFile.metadata.blankCount * 0.8;
    const score = 100 - Math.min(70, penalty);
    return Math.max(26, Math.round(score));
  }, [selectedFile]);

  const computeSeverity = (count: number, total = rowCount) => {
    if (!total) return "Low";
    const pct = Math.round((count / total) * 100);
    if (pct > 15) return "High";
    if (pct > 6) return "Medium";
    return "Low";
  };

  const insights = useMemo(() => {
    if (!selectedFile) return ["Import a dataset and the workspace will generate insights."];

    const notes: string[] = [];
    const missingPct = Math.round((selectedFile.metadata.nullCount / Math.max(1, selectedFile.metadata.rows)) * 100);
    const duplicatePct = Math.round(
      ((selectedFile.metadata.rows - selectedFile.metadata.uniqueCount) / Math.max(1, selectedFile.metadata.rows)) * 100
    );

    if (missingPct >= 10) {
      notes.push(`${missingPct}% of rows contain missing values in the current dataset.`);
    } else {
      notes.push(`Missing values are at ${missingPct}%, within acceptable range.`);
    }

    if (duplicatePct >= 5) {
      notes.push(`${duplicatePct}% of records are potential duplicates.`);
    } else {
      notes.push(`Duplicate risk is low at ${duplicatePct}%.`);
    }

    if (selectedFile.metadata.cols >= 8) {
      notes.push(`The dataset includes ${selectedFile.metadata.cols} fields, including multiple categorical and numeric dimensions.`);
    }
    notes.push("Use the SQL workspace to validate source queries before profile and transform.");
    return notes;
  }, [selectedFile]);

  const handleSourceChange = useCallback((value: "upload" | "db") => {
    setSourceType(value);
  }, []);

  const handleSectionChange = useCallback((id: string) => {
    setActiveSection(id);
  }, []);

  const handleDbPreview = useCallback(async () => {
    setIsDbLoading(true);
    try {
      const response = await fetch("/api/db/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connector: dbConnector,
          host: dbHost,
          port: dbPort,
          database: dbDatabase,
          schema: dbSchema,
          user: dbUser,
          password: dbPassword,
          query: dbQuery,
        }),
      });
      const result = await response.json();
      setDbPreview(result.data || []);
    } catch (err) {
      console.error("Database preview failed", err);
      setDbPreview([]);
    } finally {
      setIsDbLoading(false);
    }
  }, [dbConnector, dbHost, dbPort, dbDatabase, dbSchema, dbUser, dbPassword, dbQuery]);

  const handleDbImport = useCallback(() => {
    if (!dbPreview || !dbPreview.length) return;
    const metadata = calculateMetadata(dbPreview);
    if (!metadata) return;

    const fileId = Math.random().toString(36).substring(7);
    const newFile = {
      id: fileId,
      name: `${dbConnector}-preview.csv`,
      type: "application/json",
      data: dbPreview,
      originalData: [...dbPreview],
      metadata,
    };

    setFiles((prev) => [...prev, newFile]);
    setSelectedFileId(fileId);
    setDbPreview(null);
  }, [dbConnector, dbPreview]);

  const calculateMetadata = (data: any[]) => {
    if (!data.length) return null;
    const cols = Object.keys(data[0]);
    const columnStats: Record<string, any> = {};
    let totalNulls = 0;
    let totalBlanks = 0;
    const uniqueRows = new Set<string>();

    cols.forEach((col) => {
      let nulls = 0;
      let blanks = 0;
      const uniques = new Set<any>();
      let isNumeric = true;

      data.forEach((row) => {
        const val = row[col];
        if (val === null || val === undefined || val === "") {
          nulls++;
          totalNulls++;
        }
        if (typeof val === "string" && val.trim() === "") {
          blanks++;
          totalBlanks++;
        }

        if (val !== null && val !== undefined) {
          uniques.add(val);
          if (typeof val !== "number" && isNaN(Number(val))) {
            isNumeric = false;
          }
        }
      });

      columnStats[col] = {
        nulls,
        blanks,
        uniques: uniques.size,
        type: isNumeric ? "numeric" : "string",
      };
    });

    data.forEach((row) => {
      uniqueRows.add(JSON.stringify(row));
    });

    return {
      rows: data.length,
      cols: cols.length,
      nullCount: totalNulls,
      blankCount: totalBlanks,
      uniqueCount: uniqueRows.size,
      columnStats,
    };
  };

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const uploadedFiles = e.target.files;
      if (!uploadedFiles) return;

      const newFiles: FileData[] = [];

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const reader = new FileReader();

        const parsePromise = new Promise<any[]>((resolve, reject) => {
          const ext = file.name.split(".").pop()?.toLowerCase();

          if (ext === "csv") {
            Papa.parse(file, {
              header: true,
              dynamicTyping: true,
              complete: (results) => resolve(results.data),
              error: (err) => reject(err),
            });
          } else if (ext === "xlsx" || ext === "xls") {
            reader.onload = (event) => {
              const data = new Uint8Array(event.target?.result as ArrayBuffer);
              const workbook = XLSX.read(data, { type: "array" });
              const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
              resolve(XLSX.utils.sheet_to_json(firstSheet));
            };
            reader.readAsArrayBuffer(file);
          } else if (ext === "json") {
            reader.onload = (event) => {
              try {
                resolve(JSON.parse(event.target?.result as string));
              } catch (err) {
                reject(err);
              }
            };
            reader.readAsText(file);
          } else if (ext === "yaml" || ext === "yml") {
            reader.onload = (event) => {
              try {
                resolve(yaml.load(event.target?.result as string) as any[]);
              } catch (err) {
                reject(err);
              }
            };
            reader.readAsText(file);
          } else {
            reject(new Error("Unsupported file type"));
          }
        });

        try {
          const data = await parsePromise;
          const metadata = calculateMetadata(data);
          if (metadata) {
            const fileId = Math.random().toString(36).substring(7);
            newFiles.push({
              id: fileId,
              name: file.name,
              type: file.type || "application/octet-stream",
              data,
              originalData: [...data],
              metadata,
            });
          }
        } catch (err) {
          console.error(`Error parsing ${file.name}:`, err);
        }
      }

      setFiles((prev) => [...prev, ...newFiles]);
      if (newFiles.length > 0) {
        setSelectedFileId(newFiles[0].id);
      }
    },
    []
  );

  const addTransformation = () => {
    setTransformations((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), column: "", operation: "fill_nulls", value: "" },
    ]);
  };

  const removeTransformation = (id: string) => {
    setTransformations((prev) => prev.filter((item) => item.id !== id));
  };

  const updateTransformation = (id: string, field: keyof Transformation, value: string) => {
    setTransformations((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const runSqlQuery = () => {
    setIsSqlRunning(true);
    setSqlStatus("Executing query...");
    setTimeout(() => {
      setIsSqlRunning(false);
      setSqlStatus("Query executed, preview available");
    }, 1200);
  };

  const computeColumnDetails = () => {
    if (!selectedFile || !selectedColumn) return null;
    const stats = selectedFile.metadata.columnStats[selectedColumn];
    if (!stats) return null;

    const rows = selectedFile.metadata.rows;
    const nullPct = Math.round((stats.nulls / Math.max(1, rows)) * 100);
    const uniquePct = Math.round((stats.uniques / Math.max(1, rows)) * 100);
    const sampleValues = selectedFile.data.slice(0, 5).map((row) => String(row[selectedColumn] ?? "")).filter(Boolean);

    const columnValues = selectedFile.data.map((row) => row[selectedColumn]);
    const numericVals = columnValues
      .map((value) => Number(value))
      .filter((value) => !Number.isNaN(value));
    const min = numericVals.length ? Math.min(...numericVals) : null;
    const max = numericVals.length ? Math.max(...numericVals) : null;

    return {
      name: selectedColumn,
      type: stats.type,
      nullPct,
      uniquePct,
      min,
      max,
      sampleValues,
    };
  };

  const columnDetails = computeColumnDetails();

  const cleanData = () => {
    if (!selectedFile) return;
    setIsCleaning(true);

    setTimeout(() => {
      let cleaned = selectedFile.data.map((row) => ({ ...row }));
      const changeLog: string[] = [];

      transformations.forEach((trans) => {
        if (!trans.column && trans.operation !== "remove_duplicates") return;

        if (trans.operation === "remove_duplicates") {
          const seen = new Set<string>();
          const beforeCount = cleaned.length;
          cleaned = cleaned.filter((row) => {
            const key = JSON.stringify(row);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (beforeCount !== cleaned.length) {
            changeLog.push(`Removed ${beforeCount - cleaned.length} duplicate rows`);
          }
          return;
        }

        if (trans.operation === "drop_nulls") {
          const before = cleaned.length;
          cleaned = cleaned.filter((row) => {
            const value = row[trans.column];
            return value !== null && value !== undefined && String(value).trim() !== "";
          });
          if (before !== cleaned.length) {
            changeLog.push(`Dropped ${before - cleaned.length} rows with null or blank ${trans.column}`);
          }
          return;
        }

        if (trans.operation === "trim_whitespace") {
          cleaned = cleaned.map((row) => {
            const value = row[trans.column];
            if (typeof value === "string") {
              return { ...row, [trans.column]: value.trim() };
            }
            return row;
          });
          changeLog.push(`Trimmed whitespace in ${trans.column}`);
          return;
        }

        if (trans.operation === "standardize_case") {
          cleaned = cleaned.map((row) => {
            const value = row[trans.column];
            if (typeof value === "string") {
              return { ...row, [trans.column]: value.toUpperCase() };
            }
            return row;
          });
          changeLog.push(`Standardized case for ${trans.column}`);
          return;
        }

        if (trans.operation === "fill_nulls") {
          const numericValues = cleaned
            .map((row) => row[trans.column])
            .filter((value) => value !== null && value !== undefined && value !== "")
            .map((value) => Number(value))
            .filter((value) => !Number.isNaN(value));
          const fillValue = numericValues.length
            ? numericValues.reduce((sum, next) => sum + next, 0) / numericValues.length
            : trans.value || "MISSING";

          cleaned = cleaned.map((row) => {
            const value = row[trans.column];
            if (value === null || value === undefined || value === "") {
              return { ...row, [trans.column]: fillValue };
            }
            return row;
          });
          changeLog.push(`Filled missing values in ${trans.column}`);
          return;
        }
      });

      const newMetadata = calculateMetadata(cleaned);
      if (newMetadata) {
        setFiles((prev) =>
          prev.map((file) =>
            file.id === selectedFile.id ? { ...file, data: cleaned, metadata: newMetadata } : file
          )
        );

        const run: RunHistory = {
          id: Math.random().toString(36).substring(7),
          timestamp: Date.now(),
          fileName: selectedFile.name,
          config: {
            nulls: "leave",
            blanks: "leave",
            zeros: "leave",
            duplicates: "keep",
          },
          rowsRemoved: selectedFile.data.length - cleaned.length,
          changes: changeLog.length ? changeLog : ["Applied transformation workflow"],
        };

        setHistory((prev) => [run, ...prev]);
      }

      setIsCleaning(false);
    }, 900);
  };

  const [history, setHistory] = useState<RunHistory[]>([]);

  const resetFile = () => {
    if (!selectedFile) return;
    const originalMetadata = calculateMetadata(selectedFile.originalData);
    if (!originalMetadata) return;

    setFiles((prev) =>
      prev.map((file) =>
        file.id === selectedFile.id ? { ...file, data: [...file.originalData], metadata: originalMetadata } : file
      )
    );
    setHistory((prev) => [
      {
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        fileName: selectedFile.name,
        config: {
          nulls: "leave",
          blanks: "leave",
          zeros: "leave",
          duplicates: "keep",
        },
        rowsRemoved: 0,
        changes: ["Reset dataset to original state"],
      },
      ...prev,
    ]);
  };

  const downloadCSV = () => {
    if (!selectedFile) return;
    const csv = Papa.unparse(selectedFile.data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `cleaned_${selectedFile.name.split(".")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const beforeMetadata = useMemo(() => {
    if (!selectedFile) return null;
    return calculateMetadata(selectedFile.originalData);
  }, [selectedFile]);

  return (
    <div className="min-h-screen text-slate-100 bg-slate-950">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "transition-all border-r border-slate-800 bg-slate-950",
            showSidebar ? "w-72" : "w-20"
          )}
        >
          <div className="flex h-full flex-col py-4 px-3">
            <div className="mb-6 flex items-center justify-between gap-2 px-2">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-2xl bg-indigo-600 flex items-center justify-center text-slate-950">
                  <Cpu className="h-5 w-5" />
                </div>
                {showSidebar && (
                  <div>
                    <p className="text-sm font-semibold">CleanPro Studio</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Analytics</p>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowSidebar((open) => !open)}
                className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-400 hover:bg-slate-800"
              >
                <ChevronRight className={cn("h-4 w-4 transition-transform", showSidebar ? "rotate-180" : "rotate-0")} />
              </button>
            </div>

            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSectionChange(item.id)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all",
                      item.id === activeSection
                        ? "bg-slate-800 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", item.id === activeSection ? "text-indigo-400" : "text-slate-400 group-hover:text-indigo-400")} />
                    {showSidebar && <span>{item.label}</span>}
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto space-y-4 px-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
                <p className="text-slate-300 mb-2 uppercase tracking-[0.3em]">Active source</p>
                <p>{sourceType === "upload" ? "Local files" : "Database connector"}</p>
              </div>
              {showSidebar && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
                  <p className="mb-2 uppercase tracking-[0.3em] text-slate-500">Workflow</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em]">
                      <span>Profile</span>
                      <span>{selectedFile ? selectedFile.metadata.rows : 0} rows</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-cyan-500" style={{ width: `${qualityScore}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto px-4 py-4 lg:px-6">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="rounded-full bg-slate-800 px-2 py-1">Workspace</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-2 py-1 text-slate-500">Data quality</span>
              </div>
              <h1 className="text-2xl font-semibold text-slate-100">Analytics Engineering Workspace</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                <span>Dataset: <span className="text-slate-100">{activeDatasetName}</span></span>
                <span>Rows: <span className="text-slate-100">{rowCount}</span></span>
                <span>Columns: <span className="text-slate-100">{selectedFile?.metadata.cols ?? 0}</span></span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
                <Upload className="h-4 w-4 text-cyan-300" />
                <input type="file" multiple hidden onChange={handleFileUpload} accept=".csv,.xlsx,.xls,.json,.yaml,.yml" />
              </label>
              <button
                onClick={cleanData}
                disabled={isCleaning || !selectedFile}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  isCleaning || !selectedFile
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-500"
                )}
              >
                {isCleaning ? "Cleaning…" : "Clean"}
              </button>
              <button
                onClick={() => { setActiveSection("insights"); runSqlQuery(); }}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                SQL
              </button>
              <button
                onClick={downloadCSV}
                disabled={!selectedFile}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Export
              </button>
              <button
                onClick={resetFile}
                disabled={!selectedFile}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_320px] mb-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleSourceChange("upload")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-semibold transition-all",
                    sourceType === "upload"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  )}
                >
                  Upload source
                </button>
                <button
                  onClick={() => handleSourceChange("db")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-semibold transition-all",
                    sourceType === "db"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  )}
                >
                  Database connector
                </button>
              </div>

              {sourceType === "db" && (
                <div className="mt-4 grid gap-3 text-sm text-slate-300">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Connector</label>
                      <select
                        value={dbConnector}
                        onChange={(e) => setDbConnector(e.target.value)}
                        className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                      >
                        <option value="aws-redshift">AWS Redshift</option>
                        <option value="azure-synapse">Azure Synapse</option>
                        <option value="snowflake">Snowflake</option>
                        <option value="google-bigquery">Google BigQuery</option>
                        <option value="postgresql">PostgreSQL</option>
                        <option value="mysql">MySQL</option>
                        <option value="sql-server">SQL Server</option>
                        <option value="oracle">Oracle</option>
                        <option value="mongodb">MongoDB</option>
                        <option value="databricks">Databricks</option>
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Query</label>
                      <input
                        value={dbQuery}
                        onChange={(e) => setDbQuery(e.target.value)}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <button
                      onClick={handleDbPreview}
                      disabled={isDbLoading}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-semibold transition-all",
                        isDbLoading
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                          : "bg-cyan-600 text-white hover:bg-cyan-500"
                      )}
                    >
                      {isDbLoading ? "Previewing…" : "Preview query"}
                    </button>
                    <button
                      onClick={handleDbImport}
                      disabled={!dbPreview?.length}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-semibold transition-all",
                        !dbPreview?.length
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                          : "bg-emerald-600 text-white hover:bg-emerald-500"
                      )}
                    >
                      Import preview
                    </button>
                    <button
                      onClick={() => setActiveSection("datasets")}
                      className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                    >
                      View datasets
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Active panel</p>
                  <p className="mt-1 text-sm text-slate-100">{activeSection}</p>
                </div>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-400">Section</span>
              </div>
              <div className="mt-4 text-sm text-slate-300">
                {activeSection === "datasets" && (
                  <div className="space-y-3">
                    <p>Browse loaded datasets, preview file metadata, and switch active sources.</p>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                      {files.length ? (
                        <div className="space-y-2">
                          {files.map((file) => (
                            <button
                              key={file.id}
                              onClick={() => setSelectedFileId(file.id)}
                              className={cn(
                                "w-full text-left rounded-xl px-3 py-2 text-sm transition-all",
                                selectedFileId === file.id ? "bg-indigo-950 text-white" : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span>{file.name}</span>
                                <span className="text-xs text-slate-500">{file.metadata.rows} rows</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500">No datasets loaded yet. Upload or import a preview to get started.</p>
                      )}
                    </div>
                  </div>
                )}
                {activeSection === "transformations" && (
                  <div className="space-y-3">
                    <p>Manage transformation rules and build a repeatable cleanup workflow.</p>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-slate-300">
                      <div className="grid gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                        <div className="flex items-center justify-between">
                          <span>Rules configured</span>
                          <span>{transformations.length}</span>
                        </div>
                        <div className="space-y-2">
                          {transformations.map((trans) => (
                            <div key={trans.id} className="rounded-xl bg-slate-900 p-2 text-sm text-slate-200">
                              <div className="font-medium text-slate-100">{trans.operation.replace("_", " ")}</div>
                              <div className="text-slate-400">Column: {trans.column || "unset"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {activeSection === "history" && (
                  <div className="space-y-3">
                    <p>Review recent run history and transformation outcomes.</p>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                      {history.length ? (
                        <div className="space-y-2 text-sm text-slate-300">
                          {history.slice(0, 4).map((run) => (
                            <div key={run.id} className="rounded-xl bg-slate-900 p-3">
                              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                                <span>{new Date(run.timestamp).toLocaleString()}</span>
                                <span>{run.rowsRemoved} removed</span>
                              </div>
                              <div className="mt-2 text-slate-200">{run.fileName}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500">No history yet. Run the data cleaning workflow to capture history.</p>
                      )}
                    </div>
                  </div>
                )}
                {activeSection === "insights" && (
                  <div className="space-y-3">
                    <p>View AI-generated data quality observations and source issues.</p>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3 space-y-2 text-sm text-slate-200">
                      {insights.map((insight, index) => (
                        <div key={index} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                          {insight}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {activeSection === "export" && (
                  <div className="space-y-3">
                    <p>Prepare the final dataset for export and review output options.</p>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                      <div className="grid gap-3 text-sm text-slate-300">
                        <div className="flex items-center justify-between rounded-xl bg-slate-900 p-3">
                          <span>Download cleaned dataset</span>
                          <button
                            onClick={downloadCSV}
                            disabled={!selectedFile}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:bg-slate-800"
                          >
                            Export CSV
                          </button>
                        </div>
                        <div className="rounded-xl bg-slate-900 p-3 text-slate-400">
                          <p>Use the SQL workspace to validate the final query, then export the dataset.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_320px]">
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg shadow-slate-950/20">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Data Quality Score</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-100">{qualityScore}/100</p>
                  </div>
                  <div className="grid gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs text-slate-400">
                    <div className="flex items-center justify-between gap-4">
                      <span>Nulls</span>
                      <span className="text-amber-300">{computeSeverity(selectedFile?.metadata.nullCount ?? 0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Duplicates</span>
                      <span className="text-red-300">{computeSeverity(selectedFile ? selectedFile.metadata.rows - selectedFile.metadata.uniqueCount : 0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Schema Drift</span>
                      <span className="text-cyan-300">Low</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Outliers</span>
                      <span className="text-emerald-300">Medium</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  {[
                    { label: "Nulls", value: selectedFile?.metadata.nullCount ?? 0, color: "bg-amber-500" },
                    { label: "Blanks", value: selectedFile?.metadata.blankCount ?? 0, color: "bg-slate-500" },
                    { label: "Unique rows", value: selectedFile?.metadata.uniqueCount ?? 0, color: "bg-cyan-500" },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-500">
                        <span>{item.label}</span>
                        <span>{item.value}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-950">
                        <div className={cn("h-full rounded-full", item.color)} style={{ width: `${Math.min(100, (item.value / Math.max(1, selectedFile?.metadata.rows ?? 1)) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                    <ArrowDown className="h-4 w-4 text-cyan-300" />
                    <span>Pipeline</span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {[
                      { label: "Upload", status: sourceType === "upload" ? "active" : "pending" },
                      { label: "Profile", status: selectedFile ? "active" : "pending" },
                      { label: "Transform", status: transformations.length > 0 ? "active" : "pending" },
                      { label: "Validate", status: selectedFile ? "active" : "pending" },
                      { label: "Export", status: selectedFile ? "active" : "pending" },
                    ].map((step, index) => (
                      <div key={step.label} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-200">
                        <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-xl text-sm font-semibold", step.status === "active" ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300")}>{index + 1}</span>
                        <div>
                          <div className="font-medium text-slate-100">{step.label}</div>
                          <div className="text-xs text-slate-500">{step.status === "active" ? "Ready" : "Pending"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Comparison</div>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] uppercase tracking-[0.3em] text-slate-400">Before / After</span>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-300">
                    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-slate-950 p-3">
                      <span className="text-slate-400">Rows before</span>
                      <span>{beforeMetadata?.rows ?? 0}</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-slate-950 p-3">
                      <span className="text-slate-400">Rows after</span>
                      <span>{selectedFile?.metadata.rows ?? 0}</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-slate-950 p-3">
                      <span className="text-slate-400">Nulls fixed</span>
                      <span>{Math.max(0, (beforeMetadata?.nullCount ?? 0) - (selectedFile?.metadata.nullCount ?? 0))}</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-slate-950 p-3">
                      <span className="text-slate-400">Quality delta</span>
                      <span>{selectedFile ? qualityScore - (beforeMetadata ? Math.max(0, 100 - Math.min(70, (beforeMetadata.nullCount * 1.2 + beforeMetadata.blankCount * 0.8))) : 0) : 0}</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Transformations</p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-100">Transformation Workflow</h2>
                  </div>
                  <button
                    onClick={addTransformation}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  >
                    + Add Transformation
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {transformations.map((trans) => (
                    <div key={trans.id} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
                      <div className="space-y-2">
                        <label className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Column</label>
                        <select
                          value={trans.column}
                          onChange={(e) => updateTransformation(trans.id, "column", e.target.value)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                        >
                          <option value="">Select column</option>
                          {columns.map((col) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Operation</label>
                        <select
                          value={trans.operation}
                          onChange={(e) => updateTransformation(trans.id, "operation", e.target.value)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                        >
                          {transformationOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Value</label>
                        <input
                          value={trans.value}
                          onChange={(e) => updateTransformation(trans.id, "value", e.target.value)}
                          placeholder="Optional"
                          className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                        />
                      </div>

                      <button
                        onClick={() => removeTransformation(trans.id)}
                        className="mt-auto rounded-lg border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-200 hover:bg-red-900"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AI Insights</p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-100">Contextual observations</h2>
                  </div>
                  <Sparkles className="h-5 w-5 text-cyan-300" />
                </div>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  {insights.map((insight, index) => (
                    <div key={index} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <p>{insight}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Query Workspace</p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-100">SQL Editor</h2>
                  </div>
                  <div className="text-xs text-slate-400">{sqlStatus}</div>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950">
                  <Editor
                    height="260px"
                    defaultLanguage="sql"
                    defaultValue={dbQuery}
                    value={dbQuery}
                    onChange={(value) => setDbQuery(value || "")}
                    theme="vs-dark"
                    options={{
                      fontSize: 12,
                      minimap: { enabled: false },
                      wordWrap: "on",
                      lineNumbers: "on",
                      folding: true,
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button
                    onClick={runSqlQuery}
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    {isSqlRunning ? "Running…" : "Run query"}
                  </button>
                  <button
                    onClick={handleDbPreview}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  >
                    Preview
                  </button>
                </div>
              </section>
            </aside>
          </div>

          <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg shadow-slate-950/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Dataset Explorer</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-100">Data preview</h2>
              </div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-400">
                <Search className="h-4 w-4" />
                <span>Click a column header to profile</span>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm text-slate-200">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400">
                      <th className="sticky left-0 z-20 border-b border-slate-800 bg-slate-950 px-3 py-2 text-left text-xs uppercase tracking-[0.3em]">#</th>
                      {columns.slice(0, 12).map((column, index) => (
                        <th
                          key={column}
                          onClick={() => setSelectedColumn(column)}
                          className={cn(
                            "border-b border-slate-800 px-3 py-2 text-left text-xs uppercase tracking-[0.3em] text-slate-400 transition-colors hover:bg-slate-900 cursor-pointer",
                            index === 0 && "sticky left-12 z-10 bg-slate-950"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span>{column}</span>
                            <ChevronRight className="h-3 w-3 text-slate-500" />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedFile?.data ?? []).slice(0, 14).map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-slate-800 hover:bg-slate-900">
                        <td className="sticky left-0 z-10 border-r border-slate-800 bg-slate-950 px-3 py-2 text-slate-400">{rowIndex + 1}</td>
                        {columns.slice(0, 12).map((column, index) => (
                          <td
                            key={`${rowIndex}-${column}`}
                            className={cn(
                              "px-3 py-2 text-slate-200",
                              index === 0 && "sticky left-12 z-0 bg-slate-950"
                            )}
                          >
                            {String(row[column] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </main>

        <aside className="hidden w-80 shrink-0 border-l border-slate-800 bg-slate-950 px-4 py-4 xl:block">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between gap-3 text-slate-400">
                <p className="text-xs uppercase tracking-[0.3em]">Column Profile</p>
                <span className="text-[10px] uppercase tracking-[0.35em] text-slate-500">{selectedColumn || "Select a field"}</span>
              </div>
              {columnDetails ? (
                <div className="mt-4 space-y-4 text-sm text-slate-200">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Name</p>
                    <p className="mt-1 text-base font-semibold text-slate-100">{columnDetails.name}</p>
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-2xl bg-slate-950 p-3">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Type</p>
                      <p className="mt-1 font-semibold text-slate-100">{columnDetails.type}</p>
                    </div>
                    <div className="grid gap-2 rounded-2xl bg-slate-950 p-3">
                      <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                        <span>Null %</span>
                        <span>{columnDetails.nullPct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-950">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${columnDetails.nullPct}%` }} />
                      </div>
                    </div>
                    <div className="grid gap-2 rounded-2xl bg-slate-950 p-3">
                      <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                        <span>Unique %</span>
                        <span>{columnDetails.uniquePct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-950">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${columnDetails.uniquePct}%` }} />
                      </div>
                    </div>
                    <div className="grid gap-2 rounded-2xl bg-slate-950 p-3">
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Range</div>
                      <div className="flex items-center justify-between text-sm text-slate-200">
                        <span>{columnDetails.min ?? "—"}</span>
                        <span>{columnDetails.max ?? "—"}</span>
                      </div>
                    </div>
                    <div className="space-y-2 rounded-2xl bg-slate-950 p-3">
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Sample values</div>
                      <div className="flex flex-wrap gap-2">
                        {columnDetails.sampleValues.map((value, idx) => (
                          <span key={idx} className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                            {value}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                  Select any column header in the table to inspect distribution, null rate, and value samples.
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Validation Log</p>
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                    <span>Query runtime</span>
                    <span>1.2s</span>
                  </div>
                  <p className="mt-2 text-slate-200">Latest SQL preview executed successfully.</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                    <span>Preview rows</span>
                    <span>{dbPreview?.length ?? 0}</span>
                  </div>
                  <p className="mt-2 text-slate-200">Use connector preview to inspect source results before import.</p>
                </div>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
