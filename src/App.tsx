import React, { useState, useCallback, useMemo } from "react";
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
  Moon,
  Sun,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
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
  DuplicateOption 
} from "./types";

export default function App() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [config, setConfig] = useState<CleaningConfig>({
    nulls: "leave",
    blanks: "leave",
    zeros: "leave",
    duplicates: "keep",
  });
  const [isCleaning, setIsCleaning] = useState(false);
  const [sourceType, setSourceType] = useState<"upload" | "db">("upload");
  const [showConnectorModal, setShowConnectorModal] = useState(false);
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");

  const isDark = themeMode === "dark";

  const themePanel = isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200";
  const themePanelSoft = isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200";
  const themeText = isDark ? "text-slate-100" : "text-slate-950";
  const themeSubtle = isDark ? "text-slate-400" : "text-slate-600";
  const themeSubtleStrong = isDark ? "text-slate-300" : "text-slate-700";
  const themeInput = isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-950";

  const selectedFile = useMemo(() => 
    files.find(f => f.id === selectedFileId), 
    [files, selectedFileId]
  );

  const [dbConnector, setDbConnector] = useState("aws-redshift");
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState("");
  const [dbDatabase, setDbDatabase] = useState("");
  const [dbSchema, setDbSchema] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [dbQuery, setDbQuery] = useState("SELECT * FROM table_name LIMIT 100");
  const [dbPreview, setDbPreview] = useState<any[] | null>(null);
  const [isDbLoading, setIsDbLoading] = useState(false);

  const dbConnectors = useMemo(() => [
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
  ], []);

  const sourceOptions = useMemo(() => [
    { id: "upload", label: "Upload Files" },
    ...dbConnectors,
  ], [dbConnectors]);

  const currentSourceLabel = useMemo(() => {
    const selected = sourceOptions.find(option => option.id === (sourceType === "upload" ? "upload" : dbConnector));
    return selected?.label || "Upload Files";
  }, [sourceOptions, sourceType, dbConnector]);

  const handleSourceChange = useCallback((value: string) => {
    if (value === "upload") {
      setSourceType("upload");
      setShowConnectorModal(false);
    } else {
      setSourceType("db");
      setDbConnector(value);
      setShowConnectorModal(true);
    }
  }, []);

  const handleDbPreview = useCallback(async () => {
    setIsDbLoading(true);
    try {
      const response = await fetch('/api/db/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      console.error('Database preview failed', err);
      setDbPreview([]);
    } finally {
      setIsDbLoading(false);
    }
  }, [dbConnector, dbHost, dbPort, dbDatabase, dbSchema, dbUser, dbPassword, dbQuery]);

  const handleSourceSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleSourceChange(e.target.value);
  };


  const handleDbImport = () => {
    if (!dbPreview || !dbPreview.length) return;
    const metadata = calculateMetadata(dbPreview);
    if (!metadata) return;

    const fileId = Math.random().toString(36).substring(7);
    const newFile = {
      id: fileId,
      name: `${dbConnector}-preview.csv`,
      type: 'application/json',
      data: dbPreview,
      originalData: [...dbPreview],
      metadata,
    };

    setFiles(prev => [...prev, newFile]);
    setSelectedFileId(fileId);
    setDbPreview(null);
  };

  const calculateMetadata = (data: any[]) => {
    if (!data.length) return null;
    const cols = Object.keys(data[0]);
    const columnStats: Record<string, any> = {};
    let totalNulls = 0;
    let totalBlanks = 0;

    cols.forEach(col => {
      let nulls = 0;
      let blanks = 0;
      const uniques = new Set();
      let isNumeric = true;

      data.forEach(row => {
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
          if (isNaN(Number(val)) && typeof val !== "number") {
            isNumeric = false;
          }
        }
      });

      columnStats[col] = {
        nulls,
        blanks,
        uniques: uniques.size,
        type: isNumeric ? "numeric" : "string"
      };
    });

    return {
      rows: data.length,
      cols: cols.length,
      nullCount: totalNulls,
      blankCount: totalBlanks,
      uniqueCount: new Set(data.map(r => JSON.stringify(r))).size,
      columnStats
    };
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
            error: (err) => reject(err)
          });
        } else if (ext === "xlsx" || ext === "xls") {
          reader.onload = (e) => {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: "array" });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            resolve(XLSX.utils.sheet_to_json(firstSheet));
          };
          reader.readAsArrayBuffer(file);
        } else if (ext === "json") {
          reader.onload = (e) => {
            try {
              resolve(JSON.parse(e.target?.result as string));
            } catch (err) { reject(err); }
          };
          reader.readAsText(file);
        } else if (ext === "yaml" || ext === "yml") {
          reader.onload = (e) => {
            try {
              resolve(yaml.load(e.target?.result as string) as any[]);
            } catch (err) { reject(err); }
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
            metadata
          });
        }
      } catch (err) {
        console.error(`Error parsing ${file.name}:`, err);
      }
    }

    setFiles(prev => [...prev, ...newFiles]);
    if (newFiles.length > 0 && !selectedFileId) {
      setSelectedFileId(newFiles[0].id);
    }
  }, [selectedFileId]);

  const cleanData = () => {
    if (!selectedFile) return;
    setIsCleaning(true);

    setTimeout(() => {
      let cleaned = [...selectedFile.data];
      const initialRows = cleaned.length;
      const changes: string[] = [];

      // 1. Handle Duplicates
      if (config.duplicates === "remove") {
        const seen = new Set();
        const beforeCount = cleaned.length;
        cleaned = cleaned.filter(row => {
          const str = JSON.stringify(row);
          if (seen.has(str)) return false;
          seen.add(str);
          return true;
        });
        if (beforeCount !== cleaned.length) {
          changes.push(`Removed ${beforeCount - cleaned.length} duplicate rows`);
        }
      }

      // 2. Handle Blanks (Strings)
      if (config.blanks !== "leave") {
        let blankCount = 0;
        cleaned = cleaned.map(row => {
          const newRow = { ...row };
          Object.keys(newRow).forEach(key => {
            if (typeof newRow[key] === "string" && newRow[key].trim() === "") {
              if (config.blanks === "toNull") {
                newRow[key] = null;
                blankCount++;
              }
            }
          });
          return newRow;
        });

        if (config.blanks === "drop") {
          const before = cleaned.length;
          cleaned = cleaned.filter(row => {
            return !Object.values(row).some(v => typeof v === "string" && v.trim() === "");
          });
          if (before !== cleaned.length) {
            changes.push(`Dropped ${before - cleaned.length} rows with blank strings`);
          }
        } else if (blankCount > 0) {
          changes.push(`Converted ${blankCount} blank strings to NULL`);
        }
      }

      // 3. Handle Zeros
      if (config.zeros !== "leave") {
        const cols = Object.keys(cleaned[0] || {});
        cols.forEach(col => {
          const stats = selectedFile.metadata.columnStats[col];
          if (stats.type === "numeric") {
            let zeroCount = 0;
            const values = cleaned.map(r => Number(r[col])).filter(v => !isNaN(v));
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const sorted = [...values].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];

            cleaned = cleaned.map(row => {
              if (row[col] === 0) {
                zeroCount++;
                if (config.zeros === "toNull") return { ...row, [col]: null };
                if (config.zeros === "replaceMean") return { ...row, [col]: mean };
                if (config.zeros === "replaceMedian") return { ...row, [col]: median };
              }
              return row;
            });
            if (zeroCount > 0) {
              changes.push(`Handled ${zeroCount} zero values in column '${col}' using ${config.zeros}`);
            }
          }
        });
      }

      // 4. Handle NULLs
      if (config.nulls !== "leave") {
        if (config.nulls === "drop") {
          const before = cleaned.length;
          cleaned = cleaned.filter(row => {
            return !Object.values(row).some(v => v === null || v === undefined || v === "");
          });
          if (before !== cleaned.length) {
            changes.push(`Dropped ${before - cleaned.length} rows with NULL values`);
          }
        } else {
          const cols = Object.keys(cleaned[0] || {});
          cols.forEach(col => {
            const stats = selectedFile.metadata.columnStats[col];
            let fillCount = 0;
            
            cleaned = cleaned.map(row => {
              if (row[col] === null || row[col] === undefined || row[col] === "") {
                fillCount++;
                if (config.nulls === "fill0") return { ...row, [col]: 0 };
                if (config.nulls === "fillMean" && stats.type === "numeric") {
                  const values = selectedFile.data.map(r => Number(r[col])).filter(v => !isNaN(v));
                  const mean = values.reduce((a, b) => a + b, 0) / values.length;
                  return { ...row, [col]: mean };
                }
                if (config.nulls === "fillMode") {
                  const counts: Record<any, number> = {};
                  selectedFile.data.forEach(r => {
                    const v = r[col];
                    if (v !== null && v !== undefined && v !== "") {
                      counts[v] = (counts[v] || 0) + 1;
                    }
                  });
                  const mode = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, "");
                  return { ...row, [col]: mode };
                }
              }
              return row;
            });
            if (fillCount > 0) {
              changes.push(`Filled ${fillCount} NULLs in column '${col}' using ${config.nulls}`);
            }
          });
        }
      }

      const newMetadata = calculateMetadata(cleaned);
      if (newMetadata) {
        setFiles(prev => prev.map(f => f.id === selectedFile.id ? { ...f, data: cleaned, metadata: newMetadata } : f));
        
        const run: RunHistory = {
          id: Math.random().toString(36).substring(7),
          timestamp: Date.now(),
          fileName: selectedFile.name,
          config: { ...config },
          rowsRemoved: initialRows - cleaned.length,
          changes
        };
        setHistory(prev => [run, ...prev]);
      }
      setIsCleaning(false);
    }, 800);
  };

  const resetFile = () => {
    if (!selectedFile) return;
    const originalMetadata = calculateMetadata(selectedFile.originalData);
    if (originalMetadata) {
      setFiles(prev => prev.map(f => f.id === selectedFile.id ? { 
        ...f, 
        data: [...selectedFile.originalData], 
        metadata: originalMetadata 
      } : f));
      
      const run: RunHistory = {
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        fileName: selectedFile.name,
        config: config,
        rowsRemoved: 0,
        changes: ["Reset to original data"]
      };
      setHistory(prev => [run, ...prev]);
    }
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

  return (
    <div className={cn(
      "min-h-screen font-sans",
      isDark
        ? "bg-slate-950 text-slate-100 selection:bg-slate-700/40"
        : "bg-slate-50 text-slate-950 selection:bg-slate-200/80"
    )}>
      {/* Header */}
      <header className={cn(
        "sticky top-4 z-50 backdrop-blur-sm py-4",
        isDark
          ? "border-b border-slate-800 bg-slate-950/98"
          : "border-b border-slate-200 bg-white/95"
      )}>
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center shadow-slate-900/30">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className={cn("text-lg font-semibold tracking-tight", themeText)}>CleanSheet</h1>
              <p className={cn("text-sm", themeSubtle)}>Selected source: {currentSourceLabel}</p>
              <p className={cn("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-600")}>Import local files or connect to databases, preview datasets, and clean them in one workflow.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold",
              isDark ? "bg-slate-900 text-slate-300" : "bg-slate-100 text-slate-700"
            )}>Source menu available below</div>
            <button
              type="button"
              onClick={() => setThemeMode(isDark ? "light" : "dark")}
              className={cn(
                "w-10 h-10 rounded-lg border transition-colors flex items-center justify-center",
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                  : "border-slate-200 bg-slate-100 text-slate-950 hover:bg-slate-200"
              )}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {showConnectorModal && sourceType === "db" && (
          <div className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-4",
            isDark ? "bg-slate-900/60" : "bg-slate-200/60"
          )}>
            <div className={cn(
              "w-full max-w-2xl rounded-xl shadow-2xl p-6",
              themePanel
            )}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-indigo-400 uppercase tracking-[0.3em]">Next steps</p>
                  <h2 className={cn("mt-3 text-2xl font-bold", themeText)}>Set up {currentSourceLabel}</h2>
                </div>
                <button
                  onClick={() => setShowConnectorModal(false)}
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-6 space-y-4 text-sm text-slate-400">
                <p>Follow these guided steps to import your dataset from the selected connector.</p>
                <ol className="space-y-3 pl-5 list-decimal text-slate-400">
                  <li><span className="font-semibold">Enter connection details</span> for {currentSourceLabel} in the form below.</li>
                  <li><span className="font-semibold">Paste or update</span> the SQL query to fetch the data you need.</li>
                  <li><span className="font-semibold">Preview query results</span> and then import the dataset for cleaning.</li>
                </ol>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowConnectorModal(false)}
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Continue to connector
                </button>
              </div>
            </div>
          </div>
        )}

        <section className={cn("mb-8 rounded-xl shadow-none p-5", themePanel)}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-indigo-600 uppercase tracking-[0.3em]">Data source</p>
              <h2 className={cn("mt-3 text-2xl font-bold", themeText)}>Choose where your data comes from</h2>
              <p className={cn("mt-2 text-sm max-w-2xl", themeSubtle)}>
                Select either a local file upload or a database connector. The screen will update with the guided next step for your source.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr] items-end">
            <div className="grid gap-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Data source</label>
              <select
                value={sourceType === "upload" ? "upload" : dbConnector}
                onChange={handleSourceSelectionChange}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500",
                  themeInput
                )}
              >
                {sourceOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className={cn(
              "rounded-xl p-4 text-sm leading-6",
              themePanelSoft,
              isDark ? "text-slate-400" : "text-slate-600"
            )}>
              {sourceType === "upload" ? (
                <>
                  Upload local CSV, Excel, JSON, or YAML files. The upload form will appear below once you select this source.
                </>
              ) : (
                <>
                  You selected <span className={cn("font-semibold", isDark ? "text-cyan-300" : "text-sky-700")}>{currentSourceLabel}</span>. Follow the popup steps to configure your connector, preview a query, and import the dataset.
                </>
              )}
            </div>
          </div>
        </section>

        {sourceType === "upload" ? (
          <section className={cn("mb-8 rounded-xl shadow-none p-6 text-center", themePanel)}>
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center">
                <FileSpreadsheet className="w-10 h-10 text-indigo-500" />
              </div>
              <div className="space-y-3 max-w-xl">
                <h2 className={cn("text-2xl font-semibold", themeText)}>Upload files locally</h2>
                <p className={cn("", themeSubtle)}>Select or drag files to add them as datasets. Once uploaded, you can clean them using the same workflow.</p>
              </div>
              <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload Files / Folder
                <input
                  type="file"
                  multiple
                  {...({ webkitdirectory: "", directory: "" } as any)}
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".csv,.xlsx,.xls,.json,.yaml,.yml"
                />
              </label>
            </div>
          </section>
        ) : (
          <section className={cn("mb-8 rounded-xl shadow-none p-5", themePanel)}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-cyan-300 uppercase tracking-[0.3em]">Database Import</p>
                <h2 className={cn("mt-3 text-2xl font-bold", themeText)}>Configure your connector</h2>
                <p className={cn("mt-2 text-sm max-w-2xl", themeSubtle)}>
                  Enter the connection details and SQL query for the selected source. A popup guides you through the next steps.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleDbPreview}
                  disabled={isDbLoading}
                  className={cn(
                    "px-4 py-2 rounded-lg font-semibold text-sm transition-all",
                    isDbLoading
                      ? "bg-slate-900 text-slate-500 cursor-not-allowed"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  )}
                >
                  {isDbLoading ? 'Previewing…' : 'Preview Query'}
                </button>
                <button
                  onClick={handleDbImport}
                  disabled={!dbPreview?.length}
                  className={cn(
                    "px-4 py-2 rounded-lg font-semibold text-sm transition-all",
                    !dbPreview?.length
                      ? "bg-slate-900 text-slate-500 cursor-not-allowed"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  )}
                >
                  Import Preview
                </button>
              </div>
            </div>

            <div className="grid gap-4 mt-6 lg:grid-cols-2">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Connector</label>
                <select
                  value={dbConnector}
                  onChange={(e) => {
                    setDbConnector(e.target.value);
                    setSourceType("db");
                    setShowConnectorModal(true);
                  }}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500",
                    themeInput
                  )}
                >
                  {dbConnectors.map(connector => (
                    <option key={connector.id} value={connector.id}>{connector.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Host</label>
                <input
                  value={dbHost}
                  onChange={(e) => setDbHost(e.target.value)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500",
                    themeInput
                  )}
                  placeholder="db.example.com"
                />
              </div>

              <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Port</label>
                  <input
                    value={dbPort}
                    onChange={(e) => setDbPort(e.target.value)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500",
                      themeInput
                    )}
                    placeholder="5439"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Database</label>
                  <input
                    value={dbDatabase}
                    onChange={(e) => setDbDatabase(e.target.value)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500",
                      themeInput
                    )}
                    placeholder="my_database"
                  />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Schema</label>
                  <input
                    value={dbSchema}
                    onChange={(e) => setDbSchema(e.target.value)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500",
                      themeInput
                    )}
                    placeholder="public"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">User</label>
                  <input
                    value={dbUser}
                    onChange={(e) => setDbUser(e.target.value)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500",
                      themeInput
                    )}
                    placeholder="username"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Password</label>
                <input
                  type="password"
                  value={dbPassword}
                  onChange={(e) => setDbPassword(e.target.value)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500",
                    themeInput
                  )}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">SQL Query</label>
                <textarea
                  value={dbQuery}
                  onChange={(e) => setDbQuery(e.target.value)}
                  className={cn(
                    "min-h-[180px] w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none",
                    themeInput
                  )}
                />
              </div>

              {dbPreview && dbPreview.length > 0 && (
                <div className={cn("rounded-xl p-4", themePanel)}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-slate-100">Preview loaded</p>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{dbPreview.length} rows</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-400">
                      <thead>
                        <tr>
                          {Object.keys(dbPreview[0]).map(col => (
                            <th key={col} className="px-3 py-2 font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-800">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dbPreview.slice(0, 3).map((row, idx) => (
                          <tr key={idx} className="odd:bg-slate-900 even:bg-slate-950">
                            {Object.values(row).map((cell, index) => (
                              <td key={index} className="px-3 py-2 whitespace-nowrap text-slate-300">{String(cell)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {!files.length ? (
          <div className={cn(
          "flex flex-col items-center justify-center py-12 border-dashed rounded-xl",
          isDark ? "border border-slate-700 bg-slate-900/70" : "border border-slate-200 bg-slate-50/70"
        )}>
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
              <FileSpreadsheet className="w-10 h-10 text-indigo-500" />
            </div>
            <h2 className={cn("text-xl font-semibold mb-2", themeText)}>No dataset loaded yet</h2>
            <p className={cn("mb-6 max-w-md text-center", themeSubtle)}>
              {sourceType === "upload"
                ? "Upload CSV, Excel, JSON or YAML files to start cleaning your data. You can select multiple files or drag them here."
                : "Select a connector and preview a query to import a dataset. You can also switch back to Upload Files in the source dropdown above."
              }
            </p>
            {sourceType === "upload" ? (
              <label className={cn(
                "cursor-pointer px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-3 group",
                isDark
                  ? "bg-slate-900 border border-slate-800 hover:border-indigo-500 hover:bg-slate-800 text-slate-300"
                  : "bg-slate-100 border border-slate-200 hover:border-indigo-500 hover:bg-slate-200 text-slate-950"
              )}>
                <Upload className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />
                Choose Files or Folder
                <input 
                  type="file" 
                  multiple 
                  {...({ webkitdirectory: "", directory: "" } as any)}
                  className="hidden" 
                  onChange={handleFileUpload}
                  accept=".csv,.xlsx,.xls,.json,.yaml,.yml"
                />
              </label>
            ) : (
              <button
                onClick={() => setSourceType("upload")}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-500 transition-all"
              >
                Switch to Upload Files
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Sidebar: File List & Config */}
            <div className="lg:col-span-4 space-y-6">
              {/* File Selector */}
              <section className="bg-slate-950 rounded-lg border border-slate-800 p-4 shadow-none">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Your Datasets
                </h3>
                <div className="space-y-2">
                  {files.map(file => (
                    <button
                      key={file.id}
                      onClick={() => setSelectedFileId(file.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl transition-all group",
                        selectedFileId === file.id 
                          ? "bg-slate-900 text-indigo-200 ring-1 ring-slate-700" 
                          : "hover:bg-slate-900 text-slate-300"
                      )}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText className={cn("w-5 h-5 shrink-0", selectedFileId === file.id ? "text-indigo-500" : "text-slate-400")} />
                        <span className="text-sm font-medium truncate">{file.name}</span>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles(prev => prev.filter(f => f.id !== file.id));
                          if (selectedFileId === file.id) setSelectedFileId(null);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 hover:text-red-500 rounded-md transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </button>
                  ))}
                </div>
              </section>

              {/* Cleaning Options */}
              <section className="bg-slate-950 rounded-lg border border-slate-800 p-4 shadow-none">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  Cleaning Rules
                </h3>
                
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">NULL Values</label>
                    <select 
                      value={config.nulls}
                      onChange={(e) => setConfig(prev => ({ ...prev, nulls: e.target.value as NullOption }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    >
                      <option value="leave">Leave unchanged</option>
                      <option value="drop">Drop rows with NULLs</option>
                      <option value="fill0">Fill with 0</option>
                      <option value="fillMean">Fill with mean (Numeric)</option>
                      <option value="fillMode">Fill with mode</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Blank Strings</label>
                    <select 
                      value={config.blanks}
                      onChange={(e) => setConfig(prev => ({ ...prev, blanks: e.target.value as BlankOption }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    >
                      <option value="leave">Leave unchanged</option>
                      <option value="toNull">Convert to NULL</option>
                      <option value="drop">Drop rows with blanks</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Zero Values</label>
                    <select 
                      value={config.zeros}
                      onChange={(e) => setConfig(prev => ({ ...prev, zeros: e.target.value as ZeroOption }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    >
                      <option value="leave">Leave unchanged</option>
                      <option value="toNull">Convert to NULL</option>
                      <option value="replaceMean">Replace with mean</option>
                      <option value="replaceMedian">Replace with median</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Duplicates</label>
                    <select 
                      value={config.duplicates}
                      onChange={(e) => setConfig(prev => ({ ...prev, duplicates: e.target.value as DuplicateOption }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    >
                      <option value="keep">Keep duplicates</option>
                      <option value="remove">Remove duplicates</option>
                    </select>
                  </div>

                  <button
                    onClick={cleanData}
                    disabled={isCleaning || !selectedFile}
                    className={cn(
                      "w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg",
                      isCleaning 
                        ? "bg-slate-900 text-slate-500 cursor-not-allowed" 
                        : "bg-indigo-600 hover:bg-indigo-500 text-white active:scale-[0.98]"
                    )}
                  >
                    {isCleaning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Cleaning...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Clean Data
                      </>
                    )}
                  </button>
                </div>
              </section>

              {/* History */}
              <section className="bg-slate-950 rounded-lg border border-slate-800 p-4 shadow-none">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Run History
                </h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {history.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4 italic">No cleaning runs yet</p>
                  ) : (
                    history.map(run => (
                      <div key={run.id} className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(run.timestamp).toLocaleTimeString()}</span>
                          <span className="text-[10px] font-bold bg-red-900 text-red-300 px-1.5 py-0.5 rounded">-{run.rowsRemoved} rows</span>
                        </div>
                        <p className="text-xs font-semibold text-slate-300 truncate">{run.fileName}</p>
                        <ul className="text-[10px] text-slate-500 space-y-1 pl-2 border-l border-slate-200">
                          {run.changes.slice(0, 2).map((c, idx) => (
                            <li key={idx} className="truncate">• {c}</li>
                          ))}
                          {run.changes.length > 2 && <li className="italic">+ {run.changes.length - 2} more</li>}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* Main Content: Preview & Stats */}
            <div className="lg:col-span-8 space-y-6">
              {selectedFile ? (
                <>
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 shadow-none">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Rows</p>
                      <p className="text-2xl font-bold text-slate-100">{selectedFile.metadata.rows.toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 shadow-none">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Columns</p>
                      <p className="text-2xl font-bold text-slate-100">{selectedFile.metadata.cols}</p>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 shadow-none">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Null Values</p>
                      <p className="text-2xl font-bold text-indigo-600">
                        {((selectedFile.metadata.nullCount / (selectedFile.metadata.rows * selectedFile.metadata.cols)) * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 shadow-none">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Unique Rows</p>
                      <p className="text-2xl font-bold text-slate-100">
                        {((selectedFile.metadata.uniqueCount / selectedFile.metadata.rows) * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>

                  {/* Data Preview */}
                  <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden flex flex-col shadow-none">
                    <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900">
                      <div className="flex items-center gap-3">
                        <h2 className="font-bold text-slate-100">Data Preview</h2>
                        <span className="text-[10px] bg-slate-200 text-slate-400 px-2 py-0.5 rounded-full font-bold uppercase">Showing first 100 rows</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={resetFile}
                          className="text-slate-400 hover:text-red-300 text-sm font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-all"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Reset
                        </button>
                        <button 
                          onClick={downloadCSV}
                          className="text-indigo-600 hover:text-indigo-700 text-sm font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-all"
                        >
                          <Download className="w-4 h-4" />
                          Download CSV
                        </button>
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-950 shadow-none">
                          <tr>
                            {Object.keys(selectedFile.data[0] || {}).map(col => (
                              <th key={col} className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 min-w-[150px]">
                                <div className="flex flex-col gap-1">
                                  <span>{col}</span>
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      "text-[8px] px-1.5 py-0.5 rounded-sm",
                                      selectedFile.metadata.columnStats[col].type === "numeric" ? "bg-blue-900 text-blue-300" : "bg-amber-900 text-amber-300"
                                    )}>
                                      {selectedFile.metadata.columnStats[col].type}
                                    </span>
                                    <span className="text-[8px] text-slate-300 font-normal">
                                      {selectedFile.metadata.columnStats[col].nulls} nulls
                                    </span>
                                  </div>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {selectedFile.data.slice(0, 100).map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-900 transition-colors">
                              {Object.values(row).map((val: any, vIdx) => (
                                <td key={vIdx} className="px-3 py-2 text-sm text-slate-300 whitespace-nowrap">
                                  {val === null || val === undefined || val === "" ? (
                                    <span className="text-slate-300 italic text-xs">null</span>
                                  ) : (
                                    String(val)
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center bg-slate-900 rounded-xl border border-slate-800 border-dashed p-10">
                  <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-medium">Select a file to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.35);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.55);
        }
      `}} />
    </div>
  );
}
