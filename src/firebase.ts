import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDckyhNagC7WU69GV_9dYamr6qSZqR0za8",
  authDomain: "replany-90877.firebaseapp.com",
  projectId: "replany-90877",
  storageBucket: "replany-90877.firebasestorage.app",
  messagingSenderId: "306014114069",
  appId: "1:306014114069:web:dffc2d1b6a6f8f4c5e191c",
  measurementId: "G-BC3HD6D7XV"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
