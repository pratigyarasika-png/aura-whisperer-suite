/** Browser Python sandbox: loads Pyodide from CDN and runs user scripts. */

import type { Dataset } from "@/lib/dataset";
import { datasetToCsv } from "@/lib/dataset";

const PYODIDE_VERSION = "0.26.4";
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full`;

type PyodideRuntime = {
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackage: (names: string[]) => Promise<void>;
  setStdout: (options: { batched: (text: string) => void }) => void;
  setStderr: (options: { batched: (text: string) => void }) => void;
  globals: { set: (key: string, value: unknown) => void };
  FS: { writeFile: (path: string, data: string) => void };
};

let runtimePromise: Promise<PyodideRuntime> | null = null;
let stdoutSink: (text: string) => void = () => {};
let stderrSink: (text: string) => void = () => {};

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Python runtime.")));
      if (existing.dataset["loaded"] === "true") resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      script.dataset["loaded"] = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load the Python runtime from the CDN."));
    document.head.appendChild(script);
  });
}

export function getPythonRuntime(onProgress?: (message: string) => void) {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      onProgress?.("Downloading Python runtime…");
      await loadScript(`${CDN}/pyodide.js`);
      const loader = (window as unknown as {
        loadPyodide: (options: { indexURL: string }) => Promise<PyodideRuntime>;
      }).loadPyodide;
      const pyodide = await loader({ indexURL: `${CDN}/` });
      onProgress?.("Installing pandas, numpy, scipy and matplotlib…");
      await pyodide.loadPackage(["pandas", "numpy", "scipy", "matplotlib"]);
      pyodide.setStdout({ batched: (text) => stdoutSink(text) });
      pyodide.setStderr({ batched: (text) => stderrSink(text) });
      onProgress?.("Python environment ready.");
      return pyodide;
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

const FIGURE_CAPTURE = `
import base64, io, json
import matplotlib
matplotlib.use("AGG")
import matplotlib.pyplot as plt

_orbis_figures = []

def _orbis_collect():
    out = []
    for number in plt.get_fignums():
        figure = plt.figure(number)
        buffer = io.BytesIO()
        figure.savefig(buffer, format="png", dpi=110, bbox_inches="tight")
        out.append("data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode())
    plt.close("all")
    return json.dumps(out)

plt.show = lambda *a, **k: None
`;

export type PythonResult = {
  stdout: string;
  stderr: string;
  figures: string[];
  error?: string;
  durationMs: number;
};

/** Run a script with the active dataset exposed as the pandas DataFrame `df`. */
export async function runPython(
  code: string,
  dataset: Dataset | null,
  onProgress?: (message: string) => void,
): Promise<PythonResult> {
  const pyodide = await getPythonRuntime(onProgress);
  let stdout = "";
  let stderr = "";
  stdoutSink = (text) => {
    stdout += text.endsWith("\n") ? text : `${text}\n`;
  };
  stderrSink = (text) => {
    stderr += text.endsWith("\n") ? text : `${text}\n`;
  };

  const started = performance.now();
  let error: string | undefined;
  let figures: string[] = [];

  try {
    await pyodide.runPythonAsync(FIGURE_CAPTURE);
    if (dataset) {
      pyodide.FS.writeFile("/orbis_dataset.csv", datasetToCsv(dataset));
      await pyodide.runPythonAsync(
        `import pandas as pd\ndf = pd.read_csv("/orbis_dataset.csv")\n`,
      );
    } else {
      await pyodide.runPythonAsync(`import pandas as pd\ndf = pd.DataFrame()\n`);
    }
    await pyodide.runPythonAsync(code);
    const raw = await pyodide.runPythonAsync(`_orbis_collect()`);
    figures = JSON.parse(String(raw)) as string[];
  } catch (thrown) {
    error = thrown instanceof Error ? thrown.message : String(thrown);
    try {
      const raw = await pyodide.runPythonAsync(`_orbis_collect()`);
      figures = JSON.parse(String(raw)) as string[];
    } catch {
      figures = [];
    }
  } finally {
    stdoutSink = () => {};
    stderrSink = () => {};
  }

  return { stdout, stderr, figures, ...(error ? { error } : {}), durationMs: performance.now() - started };
}
