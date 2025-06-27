const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const { BlobServiceClient } = require("@azure/storage-blob");
require("dotenv").config();
const FormData = require("form-data");


//doqnloadable file path
const path = require("path");
const fs = require("fs");

const jsonDirPath = path.resolve(__dirname, "../json_script");

// Ensure directory exists
if (!fs.existsSync(jsonDirPath)) {
  fs.mkdirSync(jsonDirPath, { recursive: true });
}

//constant values
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

//util functions --------------------------------
//routing logic to download an json trnsciption into the json_script folder
const saveJson= (data) => {
  try {
    const fileName = `transcript_${Date.now()}.json`; //named after milliseconds
    const filePath = path.join(jsonDirPath, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("❌ Failed to write file:", err);

  }
};
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
// prettifies Fast transcription json
const prettifyFast = (obj) => {
  var dialogue = ""
  try{
    const text = obj.phrases
    for (var i = 0; i < text.length; i++){
      dialogue += "[speaker "+ text[i].speaker + "]\n";
      dialogue += text[i].text + "\n";
    }
  }catch (error){}
  return dialogue;
}

//save to blob storage
const saveBlob = async (fileName, type, audioBuffer, containerName  ) =>{
    const fullBlobUrl = `${CONTAINER_BLOB_URL}/${fileName}${CONTAINER_BLOB_UPLOAD_SAS}`; // url for the audio file

    // Upload to Azure Blob Storage using SAS
    const blockBlobClient = new BlobServiceClient(
      `${CONTAINER_URL}${CONTAINER_BLOB_UPLOAD_SAS}`
    )
      .getContainerClient(containerName ) // blob storage name for now
      .getBlockBlobClient(fileName);

    await blockBlobClient.uploadData(audioBuffer, {
      blobHTTPHeaders: { blobContentType: type }
    });
    return fullBlobUrl
}
//trascription functions -----------------------
const  batchTranscript = async (blobName, maxSpeakers) =>{
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
    
    //return repsonse json
    return gettranscript.data //final dialogue transcript 
}

//routing for fast Transcript
app.post("/fast_transcript",upload.single("audio"), async (req, res)=>{
  try {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file uploaded" });
  }

  //create input 
  const definition = JSON.parse(req.body.definition || "{}");
  const form = new FormData();
  form.append("audio", req.file.buffer, {
    filename: "recording.wav",
    contentType: req.file.mimetype
  });

  //send job to fast transcription
  form.append("definition", JSON.stringify(definition));
  const azureResponse = await axios.post(
      `https://${AZURE_REGION}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          "Ocp-Apim-Subscription-Key": AZURE_KEY
        }
      }
    );

    //save json file
    saveJson(azureResponse.data)
    //return json file
    res.status(200).json({
      jobUrl: azureResponse.data,
      text_format: prettifyFast(azureResponse.data)
    });
  }catch (error) {
  console.error("Error:", error.response?.data || error.message);
  res.status(500).json({ error: "Failed to submit transcription job" });
}
})

//routing logic to upload audio to blob storage and Azure service
app.post("/upload_audio", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file uploaded" });
  }

  try {
    const audioBuffer = req.file.buffer;
    const originalName = req.file.originalname || "audio.wav"; //convert .webm to .wav
    const fileName = `upload_${Date.now()}_${originalName}`; //placeholder naming convention for audio file
    //max speakers
    const maxSpeakers = parseInt(req.body.maxSpeakers) || 2;


    //save blob
    const fullBlobUrl = await saveBlob(fileName,req.file.mimetype ,audioBuffer, 'test1'  )

    // Submit transcription job to get reciept
    const data = await batchTranscript(fileName, maxSpeakers) //batch

    saveJson(data) // save json file to json_script folder
    console.log("data saved in json_script folder.")//success message

    //prettify json text to proper dialogue
    const text_format = prettify(data)
    console.log("Completed transcription.")

    //return to frontend with data
    res.status(202).json({
      message: "Transcription job submitted",
      text_format: text_format,
      jobUrl: data
    });
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to submit transcription job" });
  }
});


app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
