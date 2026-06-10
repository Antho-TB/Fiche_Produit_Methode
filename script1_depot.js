// ============================================================
// SCRIPT 1 — Formulaire de Dépôt (Form 1)
// À attacher à la feuille de réponses du Formulaire 1
// Déclencheur : Lors de l'envoi du formulaire (onFormSubmit)
// Prérequis   : Activer le service "Drive API" (v3) dans Services
// ============================================================

// ---- CONSTANTES À CONFIGURER AVANT DÉPLOIEMENT ----
const CFG = {
  // URL du Formulaire 2 (Décision)
  URL_FORM_VALIDATION: "https://docs.google.com/forms/d/e/1FAIpQLSf8_40my2WTUGvhh_KlOwOW6BfpUMdFQiRAUklElWiqttOrGQ/viewform",

  // IDs des questions pré-remplissables dans le Formulaire 2
  ENTRY_SIGNATURE_ID: "entry.1011529723",  // Identifiant de signature (Form 2)
  ENTRY_APPROUVES:    "entry.314648121",   // Processus approuvé(s) (Form 2, cases à cocher)
  ENTRY_REFUSES:      "entry.1659432920",  // Processus refusé(s) (Form 2, cases à cocher)

  // IDs des Google Sheets
  ID_SHEET_CONFIG:   "1-2RpSS6n8FyKhD9rGVGxqFlmJKTfXd0bm3ylZxm6pFA",
  ID_SHEET_TRACKER:  "1-2RpSS6n8FyKhD9rGVGxqFlmJKTfXd0bm3ylZxm6pFA",

  // Noms des onglets dans les Sheets
  NOM_ONGLET_CONFIG:   "Config_Signataires",
  NOM_ONGLET_TRACKER:  "Tracker",
};

// ---- ORDRE DES COLONNES DANS LA RÉPONSE DU FORMULAIRE 1 ----
const FORM1 = {
  TIMESTAMP:      0,
  EMAIL_DEPOSANT: 1,  // Adresse e-mail (colonne B)
  REF_PRODUIT:    2,  // Référence produit (colonne C)
  NO_REVISION:    3,  // Numéro de révision (colonne D)
  NOM_CLIENT:     4,  // Nom du client (colonne E)
  PROCESSUS:      5,  // Processus modifiés (colonne F)
  URL_FICHIER:    6,  // Fichier source (.docx) (colonne G)
  SOUS_TRAITANCE: 7,  // Sous-traitance (colonne H, facultatif)
};

// ---- INDEX DES COLONNES DANS LE TRACKER SHEET (0-based) ----
const COL = {
  REF_DOC:          0,   // A
  CLIENT:           1,   // B
  GOOGLE_DOC_ID:    2,   // C
  PROCESSUS:        3,   // D
  EMAIL_VALID:      4,   // E
  SIGNATURE_ID:     5,   // F
  STATUT:           6,   // G
  DATE_SOUMISSION:  7,   // H
  DATE_VALIDATION:  8,   // I
  EMAIL_DEPOSANT:   9,   // J
  NOM_DEPOSANT:     10,  // K
};

// ---- POINT D'ENTRÉE PRINCIPAL ----
function surNouvelleDemande(e) {
  _logToSheet("INFO", "Début surNouvelleDemande");
  try {
    if (!e || !e.values) {
      const msg = "[ERREUR] Le script a été exécuté manuellement sans données de formulaire. Pour le tester, veuillez soumettre le Google Form en direct.";
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    const valeurs = e.values;
    _logToSheet("INFO", "[DIAGNOSTIC] Valeurs brutes reçues : " + JSON.stringify(valeurs));

    // Vérification de la présence de toutes les colonnes de base requises
    if (valeurs.length < 7) {
      const msg = `[ERREUR] Le formulaire n'a pas renvoyé assez de colonnes (reçu : ${valeurs.length}, attendu : 7 minimum).`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    const emailDeposant = valeurs[FORM1.EMAIL_DEPOSANT] ? valeurs[FORM1.EMAIL_DEPOSANT].trim() : '';
    const nomDeposant   = _nomDepuisEmail(emailDeposant);
    const refProduit    = valeurs[FORM1.REF_PRODUIT] ? valeurs[FORM1.REF_PRODUIT].trim() : '';
    const noRevision    = valeurs[FORM1.NO_REVISION] ? valeurs[FORM1.NO_REVISION].trim().padStart(3, '0') : '001';
    const nomClient     = valeurs[FORM1.NOM_CLIENT] ? valeurs[FORM1.NOM_CLIENT].trim() : 'INCONNU';
    const urlFichier    = valeurs[FORM1.URL_FICHIER] ? valeurs[FORM1.URL_FICHIER].trim() : '';
    const processusRaw  = valeurs[FORM1.PROCESSUS] || '';
    const sousTraitance = valeurs[FORM1.SOUS_TRAITANCE] ? valeurs[FORM1.SOUS_TRAITANCE].trim() : 'Non';

    if (!urlFichier) {
      const msg = "[ERREUR] L'URL du fichier déposé est vide.";
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    // Construction de la référence normalisée : FOR-PRO-Comp0500070-REV007
    const reference = `FOR-PRO-${refProduit}-REV${noRevision}`;
    _logToSheet("INFO", "Référence construite : " + reference);

    // Parsing des processus sélectionnés
    const processusSelectionnes = processusRaw
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (processusSelectionnes.length === 0) {
      const msg = `[ERREUR] Aucun processus sélectionné pour ${reference}`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    // Récupération du fichier Drive et renommage
    const idFichier = _extraireIdDrive(urlFichier);
    if (!idFichier) {
      const msg = `[ERREUR] ID Drive introuvable dans l'URL : ${urlFichier}`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    _logToSheet("INFO", "Fichier source ID : " + idFichier + " - Conversion en cours...");
    // Conversion .docx → Google Doc natif
    const idGoogleDoc = _convertirEnGoogleDoc(idFichier, reference);
    _logToSheet("INFO", `[OK] Google Doc créé : ${idGoogleDoc}`);

    // Chargement de la config processus → validateurs
    const configMap = _chargerConfigSignataires();
    if (Object.keys(configMap).length === 0) {
      const msg = "[ERREUR] Impossible de charger la configuration des signataires (la table de correspondance est vide).";
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    // Chargement du Tracker
    const trackerSheet = SpreadsheetApp
      .openById(CFG.ID_SHEET_TRACKER)
      .getSheetByName(CFG.NOM_ONGLET_TRACKER);

    if (!trackerSheet) {
      const msg = `[ERREUR] Onglet '${CFG.NOM_ONGLET_TRACKER}' introuvable.`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    // Récupération de l'existant pour la relance ciblée
    const donneesTracker = trackerSheet.getDataRange().getValues();
    const existantMap = {}; // { PROCESSUS: { rowIndex, statut, validateur, signatureId, dateValidation } }
    for (let i = 1; i < donneesTracker.length; i++) {
      if (donneesTracker[i][COL.REF_DOC] === reference) {
        const proc = donneesTracker[i][COL.PROCESSUS].toUpperCase();
        existantMap[proc] = {
          rowIndex: i + 1,
          statut: donneesTracker[i][COL.STATUT],
          validateur: donneesTracker[i][COL.EMAIL_VALID],
          signatureId: donneesTracker[i][COL.SIGNATURE_ID],
          dateValidation: donneesTracker[i][COL.DATE_VALIDATION]
        };
      }
    }

    // Regroupement par validateur : email -> [{ processus, rowIndex, isNew }]
    const emailMap = new Map();

    processusSelectionnes.forEach(processus => {
      let emailsValidateurs = [];
      if (sousTraitance === 'Oui') {
        // En cas de sous-traitance, seul Alex est signataire pour tous les processus
        emailsValidateurs = ['a.devaux@tb-groupe.fr'];
      } else {
        emailsValidateurs = configMap[processus.toUpperCase()] || [];
      }

      if (emailsValidateurs.length === 0) {
        const msg = `[WARN] Aucun validateur configuré pour : "${processus}"`;
        console.warn(msg);
        _logToSheet("WARN", msg);
        return;
      }

      // On affecte le premier validateur de la liste
      const emailValidateur = emailsValidateurs[0];
      const procKey = processus.toUpperCase();

      const existant = existantMap[procKey];
      if (existant) {
        if (existant.statut === 'APPROUVÉ') {
          // Si déjà validé, on met à jour l'ID du Google Doc dans le tracker
          trackerSheet.getRange(existant.rowIndex, COL.GOOGLE_DOC_ID + 1).setValue(idGoogleDoc);
          // Et on ré-injecte la signature dans la nouvelle copie du document
          try {
            _insererSignatureDansTableau(idGoogleDoc, processus, existant.validateur, existant.signatureId, existant.dateValidation, noRevision);
            _logToSheet("INFO", `Signature ré-injectée dans le nouveau document pour : ${processus}`);
          } catch (err) {
            _logToSheet("WARN", `Échec ré-injection signature pour ${processus} : ${err.message}`);
          }
        } else {
          // Était REFUSÉ ou EN_ATTENTE : relance requise
          if (!emailMap.has(emailValidateur)) emailMap.set(emailValidateur, []);
          emailMap.get(emailValidateur).push({ processus, rowIndex: existant.rowIndex, isNew: false });
        }
      } else {
        // Nouveau processus non présent dans la révision précédente
        if (!emailMap.has(emailValidateur)) emailMap.set(emailValidateur, []);
        emailMap.get(emailValidateur).push({ processus, isNew: true });
      }
    });

    // Annulation des processus qui ne font plus partie de la sélection sur cette révision
    Object.keys(existantMap).forEach(proc => {
      const selectionne = processusSelectionnes.some(p => p.toUpperCase() === proc);
      if (!selectionne && existantMap[proc].statut !== 'ANNULÉ') {
        const row = existantMap[proc].rowIndex;
        trackerSheet.getRange(row, COL.STATUT + 1).setValue('ANNULÉ');
        _logToSheet("INFO", `Processus ${proc} retiré de la demande -> Statut : ANNULÉ`);
      }
    });

    // Traitement et notification pour chaque validateur (1 seul mail / formulaire par validateur)
    emailMap.forEach((items, emailValidateur) => {
      const signatureId = _genererSignatureId();
      
      items.forEach(item => {
        if (item.isNew) {
          trackerSheet.appendRow([
            reference,       // A : Ref_Doc
            nomClient,       // B : Client
            idGoogleDoc,     // C : Google_Doc_ID
            item.processus,  // D : Processus
            emailValidateur, // E : Validateur_Email
            signatureId,     // F : Signature_ID
            'EN_ATTENTE',    // G : Statut
            new Date(),      // H : Date_Soumission
            '',              // I : Date_Validation
            emailDeposant,   // J : Email_Deposant
            nomDeposant,     // K : Nom_Deposant
          ]);
          _logToSheet("INFO", `Ajout tracker : ${reference} | Proc: ${item.processus} | Valid: ${emailValidateur} | SigID: ${signatureId}`);
        } else {
          trackerSheet.getRange(item.rowIndex, COL.GOOGLE_DOC_ID + 1).setValue(idGoogleDoc);
          trackerSheet.getRange(item.rowIndex, COL.SIGNATURE_ID + 1).setValue(signatureId);
          trackerSheet.getRange(item.rowIndex, COL.STATUT + 1).setValue('EN_ATTENTE');
          trackerSheet.getRange(item.rowIndex, COL.DATE_SOUMISSION + 1).setValue(new Date());
          trackerSheet.getRange(item.rowIndex, COL.DATE_VALIDATION + 1).setValue('');
          _logToSheet("INFO", `Mise à jour tracker pour relance : ${reference} | Proc: ${item.processus} | Valid: ${emailValidateur} | SigID: ${signatureId}`);
        }
      });

      _logToSheet("INFO", `Envoi e-mail groupé à ${emailValidateur} pour ${items.length} processus...`);
      _envoyerEmailDemande(emailValidateur, reference, nomClient, idGoogleDoc, items, signatureId);
      _logToSheet("INFO", `E-mail envoyé à ${emailValidateur}`);
    });

    const successMsg = `[OK] Dépôt traité : ${reference} — ${processusSelectionnes.length} processus.`;
    console.log(successMsg);
    _logToSheet("INFO", successMsg);
  } catch (err) {
    const errorMsg = `[CRITIQUE] Erreur inattendue dans surNouvelleDemande : ${err.message}\n${err.stack}`;
    console.error(errorMsg);
    _logToSheet("ERREUR", errorMsg);
  }
}

function _logToSheet(niveau, message) {
  try {
    const ss = SpreadsheetApp.openById(CFG.ID_SHEET_TRACKER);
    let sheet = ss.getSheetByName("Logs");
    if (!sheet) {
      sheet = ss.insertSheet("Logs");
      sheet.appendRow(["Horodateur", "Niveau", "Message"]);
    }
    sheet.appendRow([new Date(), niveau, message]);
  } catch (err) {
    console.error("Impossible d'écrire dans les logs : " + err.message);
  }
}

// ================================================================
// FONCTIONS UTILITAIRES
// ================================================================

function _convertirEnGoogleDoc(idFichierSource, nomDocument) {
  const fichier = DriveApp.getFileById(idFichierSource);
  const mimeType = fichier.getMimeType();

  if (mimeType === 'application/vnd.google-apps.document') {
    const copie = fichier.makeCopy(`[WIP] ${nomDocument}`);
    return copie.getId();
  } else {
    const blob = fichier.getBlob();
    const metadata = {
      name: `[WIP] ${nomDocument}`,
      mimeType: 'application/vnd.google-apps.document'
    };
    const fichierConverti = Drive.Files.create(metadata, blob);
    return fichierConverti.id;
  }
}

function _chargerConfigSignataires() {
  const sheet = SpreadsheetApp
    .openById(CFG.ID_SHEET_CONFIG)
    .getSheetByName(CFG.NOM_ONGLET_CONFIG);

  const donnees = sheet.getDataRange().getValues();
  const configMap = {};

  for (let i = 1; i < donnees.length; i++) {
    const processus = donnees[i][0].toString().trim().toUpperCase();
    const emailsRaw = donnees[i][1].toString();
    const emails = emailsRaw
      .split(',')
      .map(e => e.trim())
      .filter(e => e.includes('@'));

    if (processus && emails.length > 0) {
      configMap[processus] = emails;
    }
  }
  return configMap;
}

function _genererSignatureId() {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const suffixe = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SIG-${date}-${suffixe}`;
}

function _nomDepuisEmail(email) {
  try {
    const sheet = SpreadsheetApp
      .openById(CFG.ID_SHEET_CONFIG)
      .getSheetByName('Utilisateurs');
    if (!sheet) return email;
    const donnees = sheet.getDataRange().getValues();
    for (let i = 1; i < donnees.length; i++) {
      if (donnees[i][0].toString().trim().toLowerCase() === email.toLowerCase()) {
        return donnees[i][1].toString().trim();
      }
    }
  } catch(e) {
    console.warn(`[WARN] Lookup nom impossible pour ${email} : ${e.message}`);
  }
  return email.split('@')[0].replace('.', ' ');
}

function _extraireIdDrive(url) {
  if (!url) return null;
  let m = url.match(/\/d\/([^\/\?]+)/);
  if (m) return m[1];
  m = url.match(/[?&]id=([^&]+)/);
  if (m) return m[1];
  return null;
}

/**
 * Envoie un unique e-mail par validateur contenant un seul bouton de décision
 * avec les processus concernés cochés automatiquement dans le Formulaire 2.
 */
function _envoyerEmailDemande(emailValidateur, reference, nomClient, idGoogleDoc, items, signatureId) {
  const lienDocument = `https://docs.google.com/document/d/${idGoogleDoc}/edit`;

  // Construction du lien Formulaire 2 pré-rempli (avec toutes les cases à cocher)
  let lienValidation = CFG.URL_FORM_VALIDATION
    + `?usp=pp_url`
    + `&${CFG.ENTRY_SIGNATURE_ID}=${encodeURIComponent(signatureId)}`;

  let listeProcessusHtml = '<ul>';
  items.forEach(({ processus }) => {
    lienValidation += `&${CFG.ENTRY_APPROUVES}=${encodeURIComponent(processus)}`;
    listeProcessusHtml += `<li style="font-weight:bold; font-size:14px; margin-bottom:4px;">${processus}</li>`;
  });
  listeProcessusHtml += '</ul>';

  const sujet = `[VALIDATION REQUISE] ${reference} — Client : ${nomClient}`;

  const corps = `
    <div style="font-family:Arial, sans-serif; color:#1a1a1a; max-width:700px; line-height: 1.5;">
      <p>Bonjour,</p>
      <p>Une fiche produit nécessite votre validation pour le client <strong>${nomClient}</strong>.</p>

      <p>
        <a href="${lienDocument}"
           style="color:#1a56db; font-weight:bold; font-size:15px; text-decoration:underline;">
          📄 Étape 1 — Consulter le document : ${reference}
        </a>
      </p>

      <div style="background:#f9fafb; border-left:4px solid #1a56db; padding:12px 16px; margin:16px 0;">
        <p style="margin-top:0; font-weight:bold;">Processus sous votre responsabilité :</p>
        ${listeProcessusHtml}
      </div>

      <p><strong>Étape 2 — Rendre votre décision (Groupée) :</strong></p>
      <p>
        En cliquant sur le bouton ci-dessous, tous vos processus seront pré-remplis à "J'approuve". Si vous souhaitez en refuser certains, il vous suffira de décocher ces processus dans la section approbation pour les cocher dans la section refus.
      </p>

      <div style="margin:20px 0;">
        <a href="${lienValidation}"
           style="display:inline-block; background:#1a56db; color:white; padding:10px 22px;
                  text-decoration:none; border-radius:5px; font-weight:bold; font-size:14px;">
          Rendre mes décisions
        </a>
      </div>

      <p style="margin-top:24px; font-size:12px; color:#888;">
        Identifiant de signature de groupe : <strong>${signatureId}</strong><br>
        Si vous n'êtes pas le destinataire visé, ignorez cet e-mail.
      </p>
    </div>`;

  MailApp.sendEmail({ to: emailValidateur, subject: sujet, htmlBody: corps });
}

// ================================================================
// RÉ-INJECTION DES SIGNATURES EXISTANTES (PAGE 2)
// ================================================================

function _insererSignatureDansTableau(idGoogleDoc, nomProcessus, emailValidateur, signatureId, dateValidation, noRevision) {
  const doc  = DocumentApp.openById(idGoogleDoc);
  const body = doc.getBody();

  const tableHistorique = _trouverTableauHistorique(body);
  if (!tableHistorique) {
    throw new Error('Tableau HISTORIQUE DES RÉVISIONS introuvable.');
  }

  const nomProcessusNormalise = nomProcessus.trim().toUpperCase();
  const dateStr = Utilities.formatDate(new Date(dateValidation), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const texteValideur = `${emailValidateur}\n${signatureId}`;

  let ligneEcrite = false;
  const numRows = tableHistorique.getNumRows();

  for (let i = 1; i < numRows; i++) {
    const cellProcessus = tableHistorique.getCell(i, 0).getText().trim().toUpperCase();

    if (cellProcessus === nomProcessusNormalise) {
      const valideurExistant = tableHistorique.getCell(i, 4).getText().trim();
      if (!valideurExistant) {
        tableHistorique.getCell(i, 1).setText(dateStr);
        tableHistorique.getCell(i, 4).setText(texteValideur);
        tableHistorique.getCell(i, 5).setText(noRevision);
        ligneEcrite = true;
        break;
      }
    }
  }

  if (!ligneEcrite) {
    const derniereIndex = _trouverDerniereIndexProcessus(tableHistorique, nomProcessusNormalise, numRows);
    if (derniereIndex >= 0) {
      tableHistorique.insertRows(derniereIndex + 1, 1);
      tableHistorique.getCell(derniereIndex + 1, 0).setText(nomProcessus);
      tableHistorique.getCell(derniereIndex + 1, 1).setText(dateStr);
      tableHistorique.getCell(derniereIndex + 1, 4).setText(texteValideur);
      tableHistorique.getCell(derniereIndex + 1, 5).setText(noRevision);
      ligneEcrite = true;
    }
  }

  doc.saveAndClose();
}

function _trouverTableauHistorique(body) {
  const tables = body.getTables();
  for (let t = 0; t < tables.length; t++) {
    const table = tables[t];
    if (table.getNumRows() > 0) {
      const premiereCellule = table.getCell(0, 0).getText().toUpperCase();
      if (premiereCellule.includes('PROCESSUS') || premiereCellule.includes('HISTORIQUE')) {
        return table;
      }
    }
  }
  return null;
}

function _trouverDerniereIndexProcessus(table, nomProcessusNormalise, numRows) {
  let dernierIndex = -1;
  for (let i = 1; i < numRows; i++) {
    if (table.getCell(i, 0).getText().trim().toUpperCase() === nomProcessusNormalise) {
      dernierIndex = i;
    }
  }
  return dernierIndex;
}

