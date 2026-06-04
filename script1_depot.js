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
  // ⚠️ À REMPLIR après avoir ajouté les deux nouvelles questions dans le Form 2
  // Méthode : Form 2 → ⋮ → "Obtenir un lien pré-rempli" → remplir les champs → copier l'URL → chercher entry.XXXXXXXXX
  ENTRY_SIGNATURE_ID: "entry.1011529723",  // question "Identifiant de signature" (Form 2)
  ENTRY_PROCESSUS:    "entry.587233368",   // question "Processus" (liste déroulante, Form 2)


  // IDs des Google Sheets (créés automatiquement)
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

    // Vérification de la présence de toutes les colonnes requises
    if (valeurs.length < 7) {
      const msg = `[ERREUR] Le formulaire n'a pas renvoyé assez de colonnes (reçu : ${valeurs.length}, attendu : 7). Vérifiez si vous collectez bien l'adresse e-mail automatiquement.`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    const emailDeposant = valeurs[FORM1.EMAIL_DEPOSANT] ? valeurs[FORM1.EMAIL_DEPOSANT].trim() : '';
    const nomDeposant   = _nomDepuisEmail(emailDeposant); // lookup Config Sheet
    const refProduit    = valeurs[FORM1.REF_PRODUIT] ? valeurs[FORM1.REF_PRODUIT].trim() : '';
    const noRevision    = valeurs[FORM1.NO_REVISION] ? valeurs[FORM1.NO_REVISION].trim().padStart(3, '0') : '001';
    const nomClient     = valeurs[FORM1.NOM_CLIENT] ? valeurs[FORM1.NOM_CLIENT].trim() : 'INCONNU';
    const urlFichier    = valeurs[FORM1.URL_FICHIER] ? valeurs[FORM1.URL_FICHIER].trim() : '';
    const processusRaw  = valeurs[FORM1.PROCESSUS] || '';

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
    // Conversion .docx → Google Doc natif (permet l'édition du tableau HISTORIQUE)
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
      const msg = `[ERREUR] Onglet '${CFG.NOM_ONGLET_TRACKER}' introuvable dans le fichier de suivi.`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    // Construction de la map email → [{processus, signatureId}]
    const emailMap = new Map();

    processusSelectionnes.forEach(processus => {
      const emailsValidateurs = configMap[processus.toUpperCase()];

      if (!emailsValidateurs || emailsValidateurs.length === 0) {
        const msg = `[WARN] Aucun validateur configuré pour : "${processus}"`;
        console.warn(msg);
        _logToSheet("WARN", msg);
        return;
      }

      emailsValidateurs.forEach(emailValidateur => {
        const signatureId = _genererSignatureId();

        // Insertion d'une ligne dans le Tracker
        trackerSheet.appendRow([
          reference,       // A : Ref_Doc
          nomClient,       // B : Client
          idGoogleDoc,     // C : Google_Doc_ID
          processus,       // D : Processus
          emailValidateur, // E : Validateur_Email
          signatureId,     // F : Signature_ID
          'EN_ATTENTE',    // G : Statut
          new Date(),      // H : Date_Soumission
          '',              // I : Date_Validation
          emailDeposant,   // J : Email_Deposant
          nomDeposant,     // K : Nom_Deposant
        ]);

        _logToSheet("INFO", `Ajout tracker : ${reference} | Proc: ${processus} | Valid: ${emailValidateur} | SigID: ${signatureId}`);

        // Regroupement pour l'envoi email
        if (!emailMap.has(emailValidateur)) emailMap.set(emailValidateur, []);
        emailMap.get(emailValidateur).push({ processus, signatureId });
      });
    });

    // Envoi d'un seul email par validateur listant tous ses processus à valider
    emailMap.forEach((items, emailValidateur) => {
      _logToSheet("INFO", `Envoi e-mail à ${emailValidateur} pour ${items.length} processus...`);
      _envoyerEmailDemande(emailValidateur, reference, nomClient, idGoogleDoc, items);
      _logToSheet("INFO", `E-mail envoyé à ${emailValidateur}`);
    });

    const successMsg = `[OK] Dépôt traité : ${reference} — ${processusSelectionnes.length} processus — ${emailMap.size} validateur(s) notifié(s).`;
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

/**
 * Gère le fichier source déposé par l'utilisateur :
 *   - Si c'est déjà un Google Doc natif (Option B), il en fait une copie de travail.
 *   - Si c'est un fichier Word (.docx), il le convertit en Google Doc natif via l'API Drive.
 * @param {string} idFichierSource - ID Drive du fichier source
 * @param {string} nomDocument     - Nom à donner au document de travail
 * @returns {string} ID du Google Doc de travail créé
 */
function _convertirEnGoogleDoc(idFichierSource, nomDocument) {
  const fichier = DriveApp.getFileById(idFichierSource);
  const mimeType = fichier.getMimeType();

  if (mimeType === 'application/vnd.google-apps.document') {
    const copie = fichier.makeCopy(`[WIP] ${nomDocument}`);
    return copie.getId();
  } else {
    const blob = fichier.getBlob();
    const metadata = {
      name: `[WIP] ${nomDocument}`, // En v3, c'est 'name' à la place de 'title'
      mimeType: 'application/vnd.google-apps.document'
    };
    // Utilisation de la syntaxe correcte de l'API Drive v3 dans Apps Script
    const fichierConverti = Drive.Files.create(metadata, blob);
    return fichierConverti.id;
  }
}

/**
 * Charge la table de configuration processus → liste d'emails depuis le Google Sheet.
 * La feuille doit avoir :
 *   - Colonne A : Nom du processus (ex: "USINAGE")
 *   - Colonne B : Emails séparés par des virgules (ex: "h.megnien@tb.fr, m.berard@tb.fr")
 * @returns {Object} Map { "PROCESSUS_EN_MAJUSCULES": ["email1", "email2"] }
 */
function _chargerConfigSignataires() {
  const sheet = SpreadsheetApp
    .openById(CFG.ID_SHEET_CONFIG)
    .getSheetByName(CFG.NOM_ONGLET_CONFIG);

  const donnees = sheet.getDataRange().getValues();
  const configMap = {};

  // On commence à i=1 pour sauter la ligne d'en-têtes
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

/**
 * Génère un identifiant de signature unique.
 * Format : SIG-YYYYMMDD-XXXX (ex: SIG-20260528-A3F7)
 * @returns {string}
 */
function _genererSignatureId() {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const suffixe = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SIG-${date}-${suffixe}`;
}

/**
 * Résout le nom complet d'un déposant depuis son email via le tab "Utilisateurs" du Config Sheet.
 * Si l'email n'est pas trouvé, retourne la partie locale de l'email (ex: "s.guillemin").
 * @param {string} email
 * @returns {string} Nom complet ou fallback sur l'email
 */
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
  // Fallback : extraire "Prenom.Nom" depuis l'email
  return email.split('@')[0].replace('.', ' ');
}

/**
 * Extrait l'ID Drive depuis une URL Google Drive.
 * Compatible avec les formats /d/ID/ et ?id=ID
 * @param {string} url
 * @returns {string|null}
 */
function _extraireIdDrive(url) {
  if (!url) return null;
  let m = url.match(/\/d\/([^\/\?]+)/);
  if (m) return m[1];
  m = url.match(/[?&]id=([^&]+)/);
  if (m) return m[1];
  return null;
}

/**
 * Envoie un email HTML au validateur listant tous les processus qui lui sont assignés.
 * Chaque processus a son propre bouton "Valider" avec lien Form 2 pré-rempli.
 *
 * @param {string} emailValidateur - Destinataire
 * @param {string} reference       - Référence du document (ex: FOR-PRO-Comp0500070-REV007)
 * @param {string} nomClient       - Nom du client
 * @param {string} idGoogleDoc     - ID du Google Doc pour le lien de consultation
 * @param {Array}  items           - [{ processus, signatureId }, ...]
 */
function _envoyerEmailDemande(emailValidateur, reference, nomClient, idGoogleDoc, items) {
  const lienDocument = `https://docs.google.com/document/d/${idGoogleDoc}/edit`;

  // Construction des lignes du tableau HTML pour chaque processus
  let lignesTableau = '';
  items.forEach(({ processus, signatureId }) => {
    const lienValidation = CFG.URL_FORM_VALIDATION
      + `?usp=pp_url`
      + `&${CFG.ENTRY_SIGNATURE_ID}=${encodeURIComponent(signatureId)}`
      + `&${CFG.ENTRY_PROCESSUS}=${encodeURIComponent(processus)}`;

    lignesTableau += `
      <tr>
        <td style="padding:10px 12px; border:1px solid #ddd; font-weight:bold;">${processus}</td>
        <td style="padding:10px 12px; border:1px solid #ddd; font-family:monospace; color:#555; font-size:12px;">${signatureId}</td>
        <td style="padding:10px 12px; border:1px solid #ddd; text-align:center;">
          <a href="${lienValidation}"
             style="display:inline-block; background:#1a56db; color:white; padding:7px 16px;
                    text-decoration:none; border-radius:5px; font-size:13px;">
            Rendre ma décision
          </a>
        </td>
      </tr>`;
  });

  const sujet = `[VALIDATION REQUISE] ${reference} — Client : ${nomClient}`;

  const corps = `
    <div style="font-family:Arial, sans-serif; color:#1a1a1a; max-width:700px;">
      <p>Bonjour,</p>
      <p>Une fiche produit nécessite votre validation pour le client <strong>${nomClient}</strong>.</p>

      <p>
        <a href="${lienDocument}"
           style="color:#1a56db; font-weight:bold;">
          📄 Étape 1 — Consulter le document : ${reference}
        </a>
      </p>

      <p><strong>Étape 2 — Rendre votre décision pour chaque processus :</strong></p>

      <table style="border-collapse:collapse; width:100%; margin-top:8px;">
        <thead>
          <tr style="background:#1a3a6b; color:white;">
            <th style="padding:10px 12px; text-align:left;">Processus</th>
            <th style="padding:10px 12px; text-align:left;">ID Signature</th>
            <th style="padding:10px 12px; text-align:center;">Action</th>
          </tr>
        </thead>
        <tbody>${lignesTableau}</tbody>
      </table>

      <p style="margin-top:20px; font-size:12px; color:#888;">
        Chaque lien est pré-rempli avec votre identifiant de signature unique.<br>
        Si vous n'êtes pas le destinataire visé, ignorez cet email.
      </p>
    </div>`;

  MailApp.sendEmail({ to: emailValidateur, subject: sujet, htmlBody: corps });
}
