import csv
import random
from datetime import date, timedelta
from pathlib import Path

samples_dir = Path("samples")
samples_dir.mkdir(parents=True, exist_ok=True)

# Generate customers.csv
regions = ["North", "South", "East", "West", "Central"]
segments = ["Consumer", "Corporate", "Home Office"]
first_names = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen"]
last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"]

random.seed(42)

customers = []
for i in range(1, 101):
    c_id = f"CUST-{1000 + i}"
    fn = random.choice(first_names)
    ln = random.choice(last_names)
    name = f"{fn} {ln}"
    reg = random.choice(regions)
    seg = random.choice(segments)
    email = f"{fn.lower()}.{ln.lower()}{i}@example.com"
    customers.append([c_id, name, reg, seg, email])

with open(samples_dir / "customers.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["customer_id", "customer_name", "region", "segment", "email"])
    writer.writerows(customers)

# Generate orders.csv
products = [
    ("Laptop Pro 15", 1299.99),
    ("Wireless Mouse", 29.99),
    ("Ergonomic Keyboard", 89.50),
    ("USB-C Monitor 27in", 349.00),
    ("Noise-Cancelling Headphones", 199.99),
    ("Desk Lamp LED", 45.00),
    ("Standing Desk", 499.00),
    ("Office Chair Executive", 299.50),
]

start_date = date(2025, 1, 1)
orders = []
for i in range(1, 1001):
    order_id = f"ORD-{20250000 + i}"
    cust = random.choice(customers)
    cust_id = cust[0]
    prod_name, unit_price = random.choice(products)
    qty = random.randint(1, 5)
    amount = round(unit_price * qty, 2)
    discount = round(amount * random.choice([0.0, 0.05, 0.10, 0.15, 0.20]), 2)
    order_date = start_date + timedelta(days=random.randint(0, 360))
    region = cust[2]
    orders.append([order_id, cust_id, order_date.isoformat(), region, prod_name, amount, discount, qty])

with open(samples_dir / "orders.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["order_id", "customer_id", "order_date", "region", "product", "amount", "discount", "quantity"])
    writer.writerows(orders)

print(f"Generated {len(customers)} customers and {len(orders)} orders in samples/")
