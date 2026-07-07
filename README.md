# Attendance AI — Pointage par reconnaissance faciale

Système de gestion des présences par reconnaissance faciale, **100 % hors ligne**,
destiné aux écoles et entreprises. Backend **FastAPI** (Python), interface **React**,
modèle **InsightFace buffalo_l** (détection SCRFD + embeddings ArcFace), base **SQLite**.

## Fonctionnalités

- Enrôlement par webcam ou photo (anti-doublon : un visage ne peut pas être inscrit deux fois)
![Enrollment](screenshots/enroll.jpg)
- Pointage par webcam, photo, ou **caméra IP** (flux lu côté serveur via OpenCV)
![Checkin](screenshots/checkin.jpg)
- Reconnaissance **multi-visages** (photos de groupe)
- **Une présence par personne et par jour** (les passages répétés vont dans un journal `logs`)
- Rejet des personnes inconnues par **seuil de similarité calibré expérimentalement**
- Tableau de bord : enrôlés / présents / absents du jour
![Dashboard](screenshots/dashboard.jpg)
- Statistiques quotidiennes et mensuelles + **export CSV**
![Stats](screenshots/stats.jpg)
- Annonce vocale **optionnelle** (désactivée par défaut — confidentialité)
- Thème jour/nuit, interface FR/EN
![Settings](screenshots/settings.jpg)
- Droit à l'effacement : suppression d'une personne et de toutes ses données

## Architecture


[ Navigateur : React (frontend/dist, servi par FastAPI) ]
        │  images (multipart)         ▲  JSON
        ▼                             │
[ FastAPI  main.py ] ── SCRFD (détection) ── ArcFace (embedding 512-d)
        │                             │
        ▼                             ▼
[ SQLite attendance.db : persons / presences / logs ]


- Le navigateur capture l'image (webcam ou fichier) et l'envoie à l'API.
- L'API détecte les visages, calcule les embeddings, compare (similarité cosinus,
  seuil 0.40) aux personnes enrôlées, et enregistre la présence du jour.
- **Aucune photo n'est stockée** : uniquement les embeddings (vecteurs de 512 nombres).

## Modèle et validation (dossier `notebook/`)

Le notebook Colab documente la partie IA :
- extraction d'embeddings ArcFace sur un sous-ensemble du dataset **LFW** (62 personnes, 1 668 images) ;
- entraînement d'un classifieur **SVM linéaire** — précision **99,40 %** sur le jeu de test ;
- visualisation **t-SNE** des embeddings ;
- analyse **FAR/FRR** pour le choix expérimental du seuil de rejet des inconnus.

## Installation

Prérequis : **Python 3.11+**, **Node.js 18+** (uniquement pour construire le frontend), webcam.

```bash
git clone https://github.com/<votre-utilisateur>/attendance-ai.git
cd attendance-ai

# 1. Dépendances Python
pip install -r requirements.txt

# 2. Construction du frontend React
cd frontend
npm install
npm run build
cd ..

# 3. Lancement
python -m uvicorn main:app
```

Ouvrir **http://127.0.0.1:8000/** dans le navigateur (autoriser la caméra).
Au premier lancement, le modèle buffalo_l (~326 Mo) est téléchargé automatiquement,
puis **tout fonctionne hors ligne**.

> Windows : si `python` ne pointe pas vers la bonne version, utiliser `py -3.12 -m uvicorn main:app`.

## Utilisation

1. **Enrôler** : entrer le nom, se placer face caméra, cliquer « Enrôler ».
2. **Pointer** : cliquer « Pointer » (ou activer le **mode automatique** : une
   reconnaissance toutes les 2,5 s). Chaque personne reconnue est enregistrée
   une seule fois par jour.
3. **Statistiques** : consulter présents/absents par jour, bilans mensuels, exporter en CSV.
4. **Paramètres** : thème, langue, URL de caméra IP (ex. `rtsp://user:pass@192.168.1.50:554/stream`).

## Sécurité, vie privée et éthique

- **Minimisation des données** : seuls les embeddings sont stockés, jamais les images.
- **Traitement 100 % local** : aucune donnée ne quitte la machine (pas de cloud).
- **Consentement** : l'enrôlement est un acte volontaire et explicite.
- **Droit à l'effacement** : route `DELETE /person/{name}` (personne + présences + logs).
- **Annonce vocale opt-in** : désactivée par défaut (annoncer publiquement les
  arrivées pose un problème de confidentialité).
- **Biais connus** : le dataset LFW utilisé pour la validation sur-représente
  certains groupes démographiques ; une évaluation sur des données locales est
  recommandée avant tout déploiement réel.
- Pour une mise en production : ajouter HTTPS et une authentification administrateur.

## Licences (important)

- Le code d'InsightFace est sous licence MIT, mais **les modèles pré-entraînés
  (buffalo_l) sont réservés à un usage recherche / non commercial**
  ([source](https://github.com/deepinsight/insightface/tree/master/python-package)).
- Le dataset LFW est un jeu de données académique.
- Ce projet est donc distribué à des fins pédagogiques et de recherche.
  Toute utilisation commerciale exigerait de remplacer le modèle par une
  alternative sous licence commerciale ou d'entraîner un modèle propre.

## Évolutions prévues

- Client mobile **Flutter** (l'API actuelle est déjà prête à le servir)
- Détection de vivacité (anti-fraude photo/vidéo)
- Enrôlement assisté depuis une photo de groupe (interface d'annotation des visages)
- Base **PostgreSQL** pour les déploiements multi-sites centralisés
- Authentification administrateur + HTTPS

















# Attendance AI — Facial Recognition Attendance System

A **100% offline** facial recognition attendance management system
designed for schools and businesses. **FastAPI** (Python) backend, **React**
frontend, **InsightFace buffalo_l** model (SCRFD face detection + ArcFace embeddings), **SQLite** database.

## Features & screenshots

* Enrollment via webcam or photo (duplicate prevention: the same face cannot be enrolled twice)
![Enrollment](screenshots/enroll.jpg)
* Attendance marking via webcam, photo, or **IP camera** (video stream processed server-side with OpenCV)
![Checkin](screenshots/checkin.jpg)
* **Multi-face recognition** (group photos supported)
* **One attendance record per person per day** (repeated detections are stored in the `logs` table)
* Unknown person rejection using an **experimentally calibrated similarity threshold**
* Dashboard: enrolled / present / absent today
![Dashboard](screenshots/dashboard.jpg)
* Daily and monthly statistics with **CSV export**
![Stats](screenshots/stats.jpg)
* Optional **voice announcement** (disabled by default for privacy)
* Light/Dark theme, French/English interface
![Settings](screenshots/settings.jpg)
* Right to erasure: delete a person and all associated data



## Architecture

[ Browser: React (frontend/dist, served by FastAPI) ]
        │  images (multipart)         ▲  JSON
        ▼                             │
[ FastAPI main.py ] ── SCRFD (detection) ── ArcFace (512-d embedding)
        │                             │
        ▼                             ▼
[ SQLite attendance.db : persons / attendances / logs ]


* The browser captures the image (webcam or file) and sends it to the API.
* The API detects faces, computes embeddings, compares them (cosine similarity,
  threshold 0.40) against enrolled people, and records the attendance for the day.
* **No photos are stored**: only embeddings (512-dimensional vectors).

## Model and Validation (`notebook/` folder)

The Colab notebook documents the AI component:

* ArcFace embedding extraction on a subset of the **LFW** dataset (62 people, 1,668 images);
* Training of a **linear SVM** classifier — **99.40%** accuracy on the test set;
* **t-SNE** visualization of embeddings;
* **FAR/FRR** analysis for the experimental selection of the unknown-person rejection threshold.

## Installation

Requirements: **Python 3.11+**, **Node.js 18+** (only required to build the frontend), and a webcam.

```bash
git clone https://github.com/<your-username>/attendance-ai.git
cd attendance-ai

# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Build the React frontend
cd frontend
npm install
npm run build
cd ..

# 3. Start the application
python -m uvicorn main:app
```

Open **http://127.0.0.1:8000/** in your browser (allow camera access).

On the first launch, the buffalo_l model (~326 MB) is downloaded automatically,
after which **the entire application works offline**.

> Windows: if `python` does not point to the correct version, use `py -3.12 -m uvicorn main:app`.

## Usage

1. **Enroll**: enter the person's name, face the camera, and click **Enroll**.
2. **Mark Attendance**: click **Mark Attendance** (or enable **Automatic Mode**: one recognition every 2.5 seconds). Each recognized person is recorded only once per day.
3. **Statistics**: view daily present/absent records, monthly summaries, and export data as CSV.
4. **Settings**: configure the theme, language, and IP camera URL (e.g. `rtsp://user:pass@192.168.1.50:554/stream`).

## Security, Privacy, and Ethics

* **Data minimization**: only embeddings are stored, never images.
* **100% local processing**: no data leaves the machine (no cloud services).
* **Consent**: enrollment is voluntary and explicit.
* **Right to erasure**: `DELETE /person/{name}` removes the person, attendance records, and logs.
* **Opt-in voice announcements**: disabled by default (publicly announcing arrivals may raise privacy concerns).
* **Known bias**: the LFW dataset used for validation over-represents certain demographic groups; evaluation on local data is recommended before any real-world deployment.
* For production deployment, HTTPS and administrator authentication should be added.

## Licenses (Important)

* The InsightFace source code is licensed under MIT, but **the pre-trained models
  (buffalo_l) are restricted to research and non-commercial use**
  ([source](https://github.com/deepinsight/insightface/tree/master/python-package)).
* The LFW dataset is an academic dataset.
* Therefore, this project is distributed for educational and research purposes only.
  Any commercial use would require replacing the model with a commercially licensed
  alternative or training a custom model.

## Planned Improvements

* **Flutter** mobile client (the current API is already compatible)
* Liveness detection (photo/video spoofing prevention)
* Assisted enrollment from a group photo (face annotation interface)
* **PostgreSQL** database for centralized multi-site deployments
* Administrator authentication + HTTPS





## Support the Project

If you find this project useful, you can:
- ⭐ Star this repository
- Fork it
- ☕ Buy me a coffee
It helps increase the project's visibility and supports future development.