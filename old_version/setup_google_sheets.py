# -*- coding: utf-8 -*-
"""
Script d'initialisation du Google Sheet de Configuration et de Suivi (Tracker)
Ce script utilise les Application Default Credentials (ADC) pour se connecter
à l'API Google Sheets et structurer le classeur de travail.

Auteur : Anthony Bezille (Junior Pro Style)
Date : 28 Mai 2026
"""

import logging
import google.auth
from googleapiclient.discovery import build

# Configuration du logging avec balises visuelles propres
logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger('sheet_setup')

# Constantes du projet
SPREADSHEET_ID = "1-2RpSS6n8FyKhD9rGVGxqFlmJKTfXd0bm3ylZxm6pFA"

# Configuration des Signataires par défaut
SIGNATAIRES_DATA = [
    ["PROCESSUS", "EMAILS_SIGNATAIRES"],
    ["DECOUPE LASER", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["DECOUPE TRADITIONNELLE", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, t.roddier@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["USINAGE", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, s.tarrerias@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["MEULAGE", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, p.bernard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["MEULAGE DOS", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, p.bernard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["TAILLAGE", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, p.bernard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["MONTAGE", "t.roddier@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["PLASTURGIE", "m.obert@tb-groupe.fr"],
    ["CLOUAGE", "m.obert@tb-groupe.fr"],
    ["MARQUAGE", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, j.tadeu@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["AFFILAGE", "p.bernard@tb-groupe.fr"],
    ["CONDITIONNEMENT", "j.tadeu@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["TEST", "a.bezille@tb-groupe.fr"]
]

# Entêtes pour le second onglet (Tracker)
TRACKER_HEADERS = [
    ["Ref_Doc", "Client", "Google_Doc_ID", "Processus", "Validateur_Email", "Signature_ID", "Statut", "Date_Soumission", "Date_Validation", "Email_Deposant", "Nom_Deposant"]
]

# Données initiales pour le troisième onglet (Utilisateurs)
UTILISATEURS_DATA = [
    ["Email", "Nom Complet"],
    ["s.guillemin@tb-groupe.fr", "Sandrine Guillemin"],
    ["a.bezille@tb-groupe.fr", "Anthony Bezille"]
]

def initialiser_google_sheet():
    logger.info("Tentative de connexion à l'API Google Sheets via les ADC...")
    try:
        # Initialisation des credentials avec les scopes appropriés
        credentials, project = google.auth.default(
            scopes=['https://www.googleapis.com/auth/spreadsheets']
        )
        service = build('sheets', 'v4', credentials=credentials)
        
        # Récupération des métadonnées du document existant
        sheet_metadata = service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
        existing_sheets = [s['properties']['title'] for s in sheet_metadata.get('sheets', [])]
        logger.info(f"Connexion réussie ! Document identifié : '{sheet_metadata['properties']['title']}'")
        
        requests = []
        
        # 1. Création des onglets manquants si nécessaire
        targets = {
            "Config_Signataires": SIGNATAIRES_DATA,
            "Tracker": TRACKER_HEADERS,
            "Utilisateurs": UTILISATEURS_DATA
        }
        
        for sheet_title in targets.keys():
            if sheet_title not in existing_sheets:
                logger.info(f"Onglet '{sheet_title}' absent. Ajout de la demande de création...")
                requests.append({
                    'addSheet': {
                        'properties': {
                            'title': sheet_title
                        }
                    }
                })
        
        # Exécution des ajouts d'onglets s'il y en a
        if requests:
            service.spreadsheets().batchUpdate(
                spreadsheetId=SPREADSHEET_ID,
                body={'requests': requests}
            ).execute()
            logger.info("Onglets créés avec succès.")
        else:
            logger.info("Tous les onglets requis sont déjà présents dans le fichier.")
            
        # 2. Remplissage des données dans chaque onglet
        for sheet_title, values in targets.items():
            range_name = f"{sheet_title}!A1"
            body = {
                'values': values
            }
            logger.info(f"Écriture des données dans l'onglet '{sheet_title}'...")
            service.spreadsheets().values().update(
                spreadsheetId=SPREADSHEET_ID,
                range=range_name,
                valueInputOption='USER_ENTERED',
                body=body
            ).execute()
            
        logger.info("[SUCCÈS] Le Google Sheet a été configuré avec tous les onglets et données requis !")
        
    except Exception as e:
        logger.error(f"Une erreur est survenue lors de l'initialisation : {e}")
        logger.error("Avez-vous bien relancé l'authentification avec les bons Scopes ?")
        logger.error("Exécutez : gcloud auth application-default login --scopes=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive")

if __name__ == "__main__":
    initialiser_google_sheet()
