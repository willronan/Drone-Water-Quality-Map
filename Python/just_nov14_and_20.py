import pandas as pd

# -----------------------------
# Configuration
# -----------------------------
INPUT_CSV = "allData.csv"
OUTPUT_CSV = "nov14_nov20.csv"
YEAR = "2025"
VALID_DATES = ["November 14", "November 20"]

# -----------------------------
# Load data
# -----------------------------
df = pd.read_csv(INPUT_CSV)

# -----------------------------
# Keep only desired dates
# -----------------------------
df = df[df["Date"].isin(VALID_DATES)]

# -----------------------------
# Remove invalid salinity values
# -----------------------------
df = df[df["salinity"] != 0]




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

df["DateOnly"] = df["Timestamp"].dt.date.astype(str)


# -----------------------------
# Remove invalid GPS points
# -----------------------------
df = df[(df["latitude"] != 0) & (df["longitude"] != 0)]

# -----------------------------
# Keep only desired columns
# -----------------------------
df_cleaned = df[
    [
        "PartitionKey",
        "RowKey",
        "DateOnly",
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
