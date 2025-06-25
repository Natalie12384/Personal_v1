const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const { BlobServiceClient } = require("@azure/storage-blob");
require("dotenv").config();

const app = express();
const PORT = 8000;

// Config
const AZURE_REGION = process.env.AZURE_REGION;
const AZURE_KEY = process.env.AZURE_KEY;
const CONTAINER_BLOB_URL = process.env.CONTAINER_BLOB_URL;
const CONTAINER_URL = process.env.CONTAINER_URL;
const CONTAINER_BLOB_SAS = process.env.CONTAINER_BLOB_SAS;
const CONTAINER_BLOB_UPLOAD_SAS = process.env.CONTAINER_BLOB_UPLOAD_SAS;

app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

app.post("/upload_audio", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file uploaded" });
  }

  try {
    const audioBuffer = req.file.buffer;
    const originalName = req.file.originalname || "audio.wav";
    const blobName = `upload_${Date.now()}_${originalName}`;
    const fullBlobUrl = `${CONTAINER_BLOB_URL}/${blobName}${CONTAINER_BLOB_UPLOAD_SAS}`;
    console.log(fullBlobUrl)

    // Upload to Azure Blob Storage using SAS
    const blockBlobClient = new BlobServiceClient(
      `${CONTAINER_URL}${CONTAINER_BLOB_UPLOAD_SAS}`
    )
      .getContainerClient('test1')
      .getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(audioBuffer, {
      blobHTTPHeaders: { blobContentType: req.file.mimetype }
    });

    console.log(`Uploaded to Blob: ${blobName}`);

    // Submit transcription job

    const transcriptionResponse = await axios.post(
      `https://${AZURE_REGION}.api.cognitive.microsoft.com/speechtotext/transcriptions:submit?api-version=2024-11-15`,
      {
        displayName: "My Audio Transcription",
        locale: "en-US",
        contentUrls: [`${CONTAINER_BLOB_URL}/${blobName}${CONTAINER_BLOB_SAS}`],
        properties: {
          wordLevelTimestampsEnabled: true,
          diarizationEnabled: true,
          timeToLiveHours: "6" //idk, shortest support is 6 hours, but all audio currently is less
        }
      },
      {
        headers: { //headersv
          "Ocp-Apim-Subscription-Key": AZURE_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    const jobLocation = transcriptionResponse.headers["location"];
    res.status(202).json({
      message: "Transcription job submitted",
      jobUrl: jobLocation
    });


  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to submit transcription job" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
