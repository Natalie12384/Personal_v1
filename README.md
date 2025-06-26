---- INSTRUCTIONS ----
Frontend instructions:
In terminal 1:
1. run "cd Frontend" in terminal to go to frontend folder
2. run "npm install" to download all dependencies and libraries used (will produce an Node_modules folder and package-lock.json of all needed libraries)
3. run "npm start" to start front end server and a page will pop up in browser

Backend instructions:
In new terminal 2:
1. run "cd backend" in terminal to go to backend folder
2. run "npm install" to download all dependencies and libraries used (will produce an Node_modules folder and package-lock.json of all needed libraries)
3. run "node index.js" to start backend server


Downloading the transcripts:
No button needed, this system automatically downloads the json file into the json_script folder :)


---- NOTE ----
NOTE: this project does store the .env file in GitHub as it contains Azure Secrets, please check that your project backend hold an proper .env file before running "nod index.js"
(image.png)

NOTE2: if your backend connection maintains an error relating to lack of authentication or key, then it is likely the keys(SAS tokens) in .env are expired and must be regenerated