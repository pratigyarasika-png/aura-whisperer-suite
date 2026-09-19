/** Pre-configured academic statistics templates for the Python sandbox. */

export type PyTemplate = {
  id: string;
  label: string;
  description: string;
  build: (columns: { numeric: string[]; categorical: string[] }) => string;
};

const num = (cols: string[], i: number) => cols[i] ?? cols[0] ?? "value";

export const PY_TEMPLATES: PyTemplate[] = [
  {
    id: "descriptive",
    label: "Descriptive statistics",
    description: "Counts, means, spread, skewness and missing values per column.",
    build: () => `import pandas as pd

# 'df' is your uploaded dataset, already loaded.
print("Shape:", df.shape)
print()
print("Missing values per column:")
print(df.isna().sum())
print()
print("Descriptive statistics:")
print(df.describe(include="all").transpose())
print()
numeric = df.select_dtypes("number")
if not numeric.empty:
    print("Skewness:")
    print(numeric.skew())
`,
  },
  {
    id: "ttest",
    label: "Independent samples t-test",
    description: "Compare the mean of a numeric outcome across two groups.",
    build: ({ numeric, categorical }) => `import pandas as pd
from scipy import stats

outcome = "${num(numeric, 0)}"
group = "${categorical[0] ?? num(numeric, 1)}"

levels = df[group].dropna().unique()[:2]
a = df.loc[df[group] == levels[0], outcome].dropna()
b = df.loc[df[group] == levels[1], outcome].dropna()

t, p = stats.ttest_ind(a, b, equal_var=False)
print(f"Groups compared: {levels[0]} (n={len(a)}) vs {levels[1]} (n={len(b)})")
print(f"Mean {levels[0]}: {a.mean():.4f}   Mean {levels[1]}: {b.mean():.4f}")
print(f"Welch t = {t:.4f}, p = {p:.5f}")
print("Significant at alpha = .05" if p < .05 else "Not significant at alpha = .05")
`,
  },
  {
    id: "anova",
    label: "One-way ANOVA",
    description: "Test mean differences of an outcome across three or more groups.",
    build: ({ numeric, categorical }) => `import pandas as pd
from scipy import stats

outcome = "${num(numeric, 0)}"
group = "${categorical[0] ?? num(numeric, 1)}"

groups = [g[outcome].dropna().values for _, g in df.groupby(group) if g[outcome].notna().sum() > 1]
f, p = stats.f_oneway(*groups)
print(f"Groups: {df[group].nunique()}   F = {f:.4f}   p = {p:.5f}")
print()
print(df.groupby(group)[outcome].agg(["count", "mean", "std"]))
`,
  },
  {
    id: "regression",
    label: "Linear regression (OLS)",
    description: "Fit an ordinary least squares model with coefficients and R².",
    build: ({ numeric }) => `import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

y_col = "${num(numeric, 0)}"
x_col = "${num(numeric, 1)}"

data = df[[x_col, y_col]].dropna()
X = np.column_stack([np.ones(len(data)), data[x_col].values])
y = data[y_col].values
beta, *_ = np.linalg.lstsq(X, y, rcond=None)
pred = X @ beta
ss_res = ((y - pred) ** 2).sum()
ss_tot = ((y - y.mean()) ** 2).sum()

print(f"{y_col} = {beta[0]:.4f} + {beta[1]:.4f} * {x_col}")
print(f"R-squared = {1 - ss_res / ss_tot:.4f}   n = {len(data)}")

plt.figure(figsize=(6, 4))
plt.scatter(data[x_col], y, alpha=.7, label="observed")
plt.plot(data[x_col], pred, color="crimson", label="fitted")
plt.xlabel(x_col); plt.ylabel(y_col); plt.legend(); plt.title("OLS fit")
plt.tight_layout()
plt.show()
`,
  },
  {
    id: "correlation",
    label: "Correlation matrix",
    description: "Pearson correlations across all numeric columns with a heatmap.",
    build: () => `import pandas as pd
import matplotlib.pyplot as plt

corr = df.select_dtypes("number").corr()
print(corr.round(3))

fig, ax = plt.subplots(figsize=(6, 5))
im = ax.imshow(corr.values, cmap="RdBu_r", vmin=-1, vmax=1)
ax.set_xticks(range(len(corr))); ax.set_xticklabels(corr.columns, rotation=45, ha="right")
ax.set_yticks(range(len(corr))); ax.set_yticklabels(corr.columns)
fig.colorbar(im, ax=ax)
ax.set_title("Correlation matrix")
plt.tight_layout()
plt.show()
`,
  },
  {
    id: "distribution",
    label: "Distribution & normality",
    description: "Histogram plus Shapiro-Wilk normality test for a numeric column.",
    build: ({ numeric }) => `import matplotlib.pyplot as plt
from scipy import stats

col = "${num(numeric, 0)}"
values = df[col].dropna()

w, p = stats.shapiro(values.sample(min(len(values), 500), random_state=0))
print(f"{col}: n={len(values)}  mean={values.mean():.4f}  sd={values.std():.4f}")
print(f"Shapiro-Wilk W = {w:.4f}, p = {p:.5f}")
print("Distribution looks non-normal" if p < .05 else "No evidence against normality")

plt.figure(figsize=(6, 4))
plt.hist(values, bins=20, color="#4f8ef7", edgecolor="white")
plt.title(f"Distribution of {col}"); plt.xlabel(col); plt.ylabel("Frequency")
plt.tight_layout()
plt.show()
`,
  },
];
