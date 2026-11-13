# RetailLens – Retail Sales Analytics Dashboard

RetailLens is a web-based retail sales analytics dashboard designed to transform raw sales data into meaningful business insights.

## Features

- Upload retail sales datasets in CSV format.
- Process and analyze sales data dynamically.
- View important business KPIs.
- Visualize sales insights through interactive charts.
- Integrate with AWS backend services for data processing.
- Display processed analytics on the dashboard.

## Tech Stack

**Frontend**
- React.js
- Vite
- JavaScript
- Recharts
- PapaParse
- CSS

**Cloud Infrastructure**
- Amazon S3
- AWS Lambda
- Amazon DynamoDB
- Amazon SNS

## Project Structure

RetailLens/
├── frontend/
│   ├── public/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── retaillens_test.csv
├── .gitignore
└── README.md

## Installation and Setup

1. Clone the repository:

   git clone YOUR_GITHUB_REPOSITORY_URL

2. Navigate to the frontend folder:

   cd RetailLens/frontend

3. Install dependencies:

   npm install

4. Start the development server:

   npm run dev

5. Open the local URL displayed in the terminal.

## Production Build

Run:

npm run build

## Project Goal

To simplify retail sales analysis by converting raw CSV datasets into interactive visual insights that support data-driven decision-making.

---
Developed as a learning and portfolio project.
