
const API_URL =
  "https://4vvw25gpuqrqnrn74i2pb4ez740rmmrr.lambda-url.us-east-1.on.aws/";

// --------------------------------------------------
// 1. CHECK AWS BACKEND CONNECTION
// --------------------------------------------------

export async function getRetailLensData() {
  const response = await fetch(API_URL);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "AWS backend connection failed");
  }

  return data;
}

// --------------------------------------------------
// 2. GENERATE PRESIGNED S3 UPLOAD URL
// --------------------------------------------------

export async function createUploadUrl(filename) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filename }),
  });

  const data = await response.json();

  if (!response.ok || data.status !== "success") {
    throw new Error(data.message || "Could not generate upload URL");
  }

  return data;
}

// --------------------------------------------------
// 3. UPLOAD CSV DIRECTLY TO AMAZON S3
// --------------------------------------------------

export async function uploadCsvToS3(file, uploadUrl) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "text/csv",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`S3 upload failed: HTTP ${response.status}`);
  }

  return true;
}

// --------------------------------------------------
// 4. RETRIEVE PROCESSED ANALYTICS FROM AWS
// --------------------------------------------------

export async function getUploadResults(inputKey) {
  const params = new URLSearchParams({
    action: "results",
    file: inputKey,
  });

  const url = `${API_URL}?${params.toString()}`;

  const response = await fetch(url);

  // Read response as text first so we can inspect AWS errors.
  const responseText = await response.text();

  console.log("AWS Results API Status:", response.status);
  console.log("AWS Results API Response:", responseText);

  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `AWS returned an invalid response: ${responseText}`
    );
  }

  if (!response.ok && response.status !== 202) {
    throw new Error(
      data.message ||
      data.error ||
      `AWS Results API failed: HTTP ${response.status}`
    );
  }

  return data;
}

// --------------------------------------------------
// 5. WAIT FOR LAMBDA PROCESSING TO COMPLETE
// --------------------------------------------------

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function waitForProcessing(
  inputKey,
  onProgress = () => {},
  maxAttempts = 60
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onProgress({
      attempt,
      maxAttempts,
      message: "Waiting for AWS data processing...",
    });

    const data = await getUploadResults(inputKey);

    if (data.status === "success") {
      return data;
    }

    if (data.status !== "processing") {
      throw new Error(
        data.message || "Unexpected AWS processing response"
      );
    }

    await delay(3000);
  }

  throw new Error(
    "AWS processing is taking longer than expected. Please check the backend."
  );
}

// --------------------------------------------------
// 6. COMPLETE CSV UPLOAD WORKFLOW
// --------------------------------------------------

export async function processCsvUpload(file, onProgress = () => {}) {
  if (!file) {
    throw new Error("Please select a CSV file.");
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Only CSV files are supported.");
  }

  // Step 1: Request upload URL
  onProgress({
    stage: "upload-url",
    message: "Connecting to AWS Lambda...",
  });

  const uploadData = await createUploadUrl(file.name);

  if (!uploadData.uploadUrl || !uploadData.inputKey) {
    throw new Error("AWS did not return a valid upload URL.");
  }

  // Step 2: Upload CSV to S3
  onProgress({
    stage: "upload",
    message: "Uploading CSV to Amazon S3...",
  });

  await uploadCsvToS3(file, uploadData.uploadUrl);

  // Step 3: Wait for AWS processing
  onProgress({
    stage: "processing",
    message: "CSV uploaded. AWS is processing your dataset...",
  });

  const results = await waitForProcessing(
    uploadData.inputKey,
    (progress) => {
      onProgress({
        stage: "processing",
        ...progress,
      });
    }
  );

  // Step 4: Return results to React dashboard
  return {
    inputKey: uploadData.inputKey,
    ...results,
  };
}
