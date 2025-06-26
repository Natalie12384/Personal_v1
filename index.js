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

//convert json into text transcript
const prettify = (obj) => {
  var dialogue = ""
  try{
    const text = obj.recognizedPhrases
    for (var i = 0; i < text.length; i++){
      dialogue += "[speaker "+ text[i].speaker + "]\n";
      dialogue += text[i].nBest[0].display + "\n";
    }
  }catch (error){}
  return dialogue;
}

//routing logic to upload audio to blob storage and Azure service
app.post("/upload_audio", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file uploaded" });
  }

  try {
    const audioBuffer = req.file.buffer;
    const originalName = req.file.originalname || "audio.wav"; //convert .webm to .wav
    const blobName = `upload_${Date.now()}_${originalName}`; //placeholder naming convention for audio file
    const fullBlobUrl = `${CONTAINER_BLOB_URL}/${blobName}${CONTAINER_BLOB_UPLOAD_SAS}`; // url for the audio file

    // Upload to Azure Blob Storage using SAS
    const blockBlobClient = new BlobServiceClient(
      `${CONTAINER_URL}${CONTAINER_BLOB_UPLOAD_SAS}`
    )
      .getContainerClient('test1') // blob storage name for now
      .getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(audioBuffer, {
      blobHTTPHeaders: { blobContentType: req.file.mimetype }
    });

    //completed blob upload message 
    console.log(`Uploaded to Blob: ${fullBlobUrl}`);

    // Submit transcription job to get reciept
    //max speakers
    const maxSpeakers = parseInt(req.body.maxSpeakers) || 2;
    const transcriptionResponse = await axios.post(
      `https://${AZURE_REGION}.api.cognitive.microsoft.com/speechtotext/transcriptions:submit?api-version=2024-11-15`,
      {
        displayName: "My Audio Transcription",
        locale: "en-US",
        contentUrls: [`${CONTAINER_BLOB_URL}/${blobName}${CONTAINER_BLOB_SAS}`],
        //contentContainerUrl : "link to container with SAS"
        properties: {
          wordLevelTimestampsEnabled: false,
          diarization: {
            enabled: true,
            maxSpeakers: maxSpeakers
          },
          displayFormWordLevelTimestampsEnabled: true,
          punctuationMode: "DictatedAndAutomatic",
          timeToLiveHours: 6 // how long this result stays in storage for
        }
      },
      {
        headers: { //headersv
          "Ocp-Apim-Subscription-Key": AZURE_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    //transcription job id
    var jobStatus = transcriptionResponse.data.status; //initially the job is NotStarted
    const job = transcriptionResponse.data.self;
    var gettranscriptionResponse = null
    //wait until job finishes
    while (jobStatus === "NotStarted" || jobStatus === "Running"){
      //get transcription jsons
      gettranscriptionResponse = await axios.get(
        job,
        {
          headers: { //headersv
            "Ocp-Apim-Subscription-Key": AZURE_KEY,
            "Content-Type": "application/json"
          }
        }
      );
      jobStatus = gettranscriptionResponse.data.status;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    //get transcription
    const jobLocation = transcriptionResponse.data.links.files;
    //get request for the batch job 
    const transcriptRef = await axios.get(
      jobLocation,
      {
        headers: { //headersv
          "Ocp-Apim-Subscription-Key": AZURE_KEY,
          "Content-Type": "application/json"
        }
      }
    );
    //find 
    var find = false
    var index = 0
    var transcript = null
    while (find === false){
      if (transcriptRef.data.values[index].kind === "Transcription"){
        transcript = transcriptRef.data.values[index].links.contentUrl;
        find = true;
      }
      index ++;
    }
    //get request for final transcript url
    const gettranscript = await axios.get(transcript);
    
    //return repsonse to front end
    console.log("Completed transcription.")
    const text_format = prettify(gettranscript.data)
    res.status(202).json({
      message: "Transcription job submitted",
      text_format: text_format,
      jobUrl: gettranscript.data
    });
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to submit transcription job" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
