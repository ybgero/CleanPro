<div align="center">
<img width="1200" height="475" alt="CleanPro Data Cleaner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CleanPro

CleanPro is a modern data cleaning tool built with React and Vite. Import datasets from local files or connect to major database platforms, preview query results, and apply cleaning rules for nulls, blanks, zeros, and duplicates.

## What this app does

- Upload local datasets in CSV, Excel, JSON, or YAML format
- Choose a database connector from a unified source selector
- Preview query results before importing datasets
- Clean data using configurable rules
- Download cleaned CSV output

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Start the local backend connector mock server:
   `npm run server`
3. Start the frontend app:
   `npm run dev`

Then open `http://localhost:3000` in your browser.

## Notes

- The app is already configured to use a local API proxy for connector preview requests.
- You can switch between local file uploads and database connectors from the source dropdown.
