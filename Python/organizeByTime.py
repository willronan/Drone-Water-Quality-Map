import pandas as pd

# Load CSV
df = pd.read_csv("november12.csv")

# Combine date + time if both exist
# Assumes:
#   Timestamp = YYYY-MM-DD
#   EnclosureTime = HH:MM:SS
df["datetime"] = pd.to_datetime(
    df["Timestamp"].astype(str) + " " + df["EnclosureTime"].astype(str),
    errors="coerce"
)

# Drop rows with invalid time (optional but recommended)
df = df.dropna(subset=["datetime"])

# Sort chronologically
df = df.sort_values("datetime")

# Remove helper column
df = df.drop(columns=["datetime"])

# Write out new CSV
df.to_csv("nov12_sorted_by_time.csv", index=False)

print("CSV reordered by enclosure time → nov12_sorted_by_time.csv")
