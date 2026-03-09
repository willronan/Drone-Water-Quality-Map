import pandas as pd

# -----------------------------
# Configuration
# -----------------------------
INPUT_CSV = "allData.csv"
OUTPUT_CSV = "allData_cleaned.csv"
YEAR = "2025"  # adjust if needed

# -----------------------------
# Load data
# -----------------------------
df = pd.read_csv(INPUT_CSV)

# -----------------------------
# Rebuild Timestamp
# Combines Date + EnclosureTime
# -----------------------------
df["Timestamp"] = pd.to_datetime(
    YEAR + " " + df["Date"] + " " + df["EnclosureTime"],
    format="%Y %B %d %H:%M:%S",
    errors="coerce",
    utc=True
)

# -----------------------------
# Remove invalid GPS points
# -----------------------------
df = df[(df["latitude"] != 0) & (df["longitude"] != 0)]

df["DateOnly"] = df["Timestamp"].dt.date.astype(str)


# -----------------------------
# Keep only desired columns
# -----------------------------
df_cleaned = df[
    [
        "PartitionKey",
        "RowKey",
        "Timestamp",
        "EnclosureTime",
        "salinity",
        "temperature",
        "latitude",
        "longitude",
    ]
]

# -----------------------------
# Sort by Timestamp (earliest first)
# -----------------------------
df_cleaned = df_cleaned.sort_values("Timestamp")

# -----------------------------
# Write cleaned CSV
# -----------------------------
df_cleaned.to_csv(OUTPUT_CSV, index=False)

print(f"Cleaned data written to {OUTPUT_CSV}")
