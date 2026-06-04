// ============================================================
// SCRIPT 2 — Formulaire de Décision (Form 2)
// À attacher à la feuille de réponses du Formulaire 2
// Déclencheur : Lors de l'envoi du formulaire (onFormSubmit)
// Prérequis   : Activer le service "Drive API" (v3) dans Services
// ============================================================

// ---- CONSTANTES (copier les mêmes valeurs que dans Script 1) ----
const CFG = {
  ID_SHEET_TRACKER:    "1-2RpSS6n8FyKhD9rGVGxqFlmJKTfXd0bm3ylZxm6pFA",
  ID_DOSSIER_SYLOB:    "10Hl9BAlG74XNt9BX03Q83DagCDHb7PuE",
  NOM_ONGLET_TRACKER:  "Tracker",
};

// ---- ORDRE DES COLONNES DANS LA RÉPONSE DU FORMULAIRE 2 ----
const FORM2 = {
  TIMESTAMP:       0,
  EMAIL_VALID:     1,  // "Votre adresse email" (colonne B)
  SIGNATURE_ID:    6,  // "Votre identifiant de signature" (colonne G)
  PROCESSUS:       7,  // "Processus que vous validez" (colonne H)
  DECISION:        8,  // "Votre décision" (colonne I)
  MOTIF_REFUS:     9,  // "Motif du refus" (colonne J)
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

const STATUT = {
  EN_ATTENTE: 'EN_ATTENTE',
  APPROUVE:   'APPROUVÉ',
  REFUSE:     'REFUSÉ',
  ANNULE:     'ANNULÉ',  // Autres validateurs du même processus après qu'un premier ait approuvé
};

const DECISION_APPROUVE = "J'approuve";

// ---- POINT D'ENTRÉE PRINCIPAL ----
function surDecision(e) {
  _logToSheet("INFO", "Début surDecision");
  try {
    if (!e || !e.values) {
      const msg = "[ERREUR] Le script a été exécuté manuellement sans données. Veuillez soumettre le Formulaire 2 en direct.";
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    const valeurs = e.values;
    _logToSheet("INFO", "[DIAGNOSTIC] Valeurs brutes reçues (Form 2) : " + JSON.stringify(valeurs));

    if (valeurs.length < 5) {
      const msg = `[ERREUR] Le formulaire de décision n'a pas assez de colonnes (reçu : ${valeurs.length}, attendu : 5 minimum).`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    const emailValidateur = valeurs[FORM2.EMAIL_VALID] ? valeurs[FORM2.EMAIL_VALID].trim() : '';
    const signatureId     = valeurs[FORM2.SIGNATURE_ID] ? valeurs[FORM2.SIGNATURE_ID].trim() : '';
    const processus       = valeurs[FORM2.PROCESSUS] ? valeurs[FORM2.PROCESSUS].trim() : '';
    const decision        = valeurs[FORM2.DECISION] ? valeurs[FORM2.DECISION].trim() : '';
    const motifRefus      = valeurs[FORM2.MOTIF_REFUS] || '';

    if (!signatureId) {
      const msg = '[ERREUR] Signature ID manquant dans la réponse du formulaire.';
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    _logToSheet("INFO", `Recherche de l'ID de signature : ${signatureId} dans le Tracker...`);

    // Chargement du Tracker
    const trackerSpreadsheet = SpreadsheetApp.openById(CFG.ID_SHEET_TRACKER);
    const trackerSheet = trackerSpreadsheet.getSheetByName(CFG.NOM_ONGLET_TRACKER);
    const donnees = trackerSheet.getDataRange().getValues();

    // Recherche de la ligne correspondant à cet identifiant de signature
    // Seules les lignes EN_ATTENTE sont traitées (protection anti-doublon)
    let ligneIndex = -1;
    for (let i = 1; i < donnees.length; i++) {
      if (
        donnees[i][COL.SIGNATURE_ID] === signatureId &&
        donnees[i][COL.STATUT] === STATUT.EN_ATTENTE
      ) {
        ligneIndex = i;
        break;
      }
    }

    if (ligneIndex === -1) {
      const msg = `[WARN] Signature ID non trouvé ou déjà traité : ${signatureId}`;
      console.warn(msg);
      _logToSheet("WARN", msg);
      return;
    }

    // Récupération des métadonnées de ce document depuis le Tracker
    const refDoc        = donnees[ligneIndex][COL.REF_DOC];
    const nomClient     = donnees[ligneIndex][COL.CLIENT];
    const idGoogleDoc   = donnees[ligneIndex][COL.GOOGLE_DOC_ID];
    const emailDeposant = donnees[ligneIndex][COL.EMAIL_DEPOSANT];
    const nomDeposant   = donnees[ligneIndex][COL.NOM_DEPOSANT];
    const rowSheet      = ligneIndex + 1; // +1 car les données commencent à la ligne 2 (ligne 1 = en-têtes)

    _logToSheet("INFO", `Signature trouvée sur la ligne ${rowSheet} pour le document ${refDoc}`);

    if (decision === DECISION_APPROUVE) {
      _logToSheet("INFO", `Décision : Approbation pour le processus ${processus}`);
      _traiterApprobation(
        trackerSheet, donnees, rowSheet, ligneIndex,
        refDoc, nomClient, idGoogleDoc,
        processus, emailValidateur, signatureId,
        emailDeposant, nomDeposant
      );
    } else {
      _logToSheet("INFO", `Décision : Refus pour le processus ${processus} (Motif : ${motifRefus})`);
      _traiterRefus(
        trackerSheet, rowSheet,
        refDoc, processus, emailValidateur, motifRefus,
        emailDeposant, nomDeposant
      );
    }
  } catch (err) {
    const errorMsg = `[CRITIQUE] Erreur dans surDecision : ${err.message}\n${err.stack}`;
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
// TRAITEMENT APPROBATION
// ================================================================

function _traiterApprobation(
  trackerSheet, donnees, rowSheet, ligneIndex,
  refDoc, nomClient, idGoogleDoc,
  processus, emailValidateur, signatureId,
  emailDeposant, nomDeposant
) {
  const maintenant = new Date();

  // 1. Mise à jour du Tracker : cette ligne → APPROUVÉ
  trackerSheet.getRange(rowSheet, COL.STATUT + 1).setValue(STATUT.APPROUVE);
  trackerSheet.getRange(rowSheet, COL.DATE_VALIDATION + 1).setValue(maintenant);

  // 2. [Modifié] Il faut la signature de chaque valideur (pas de premier arrivé premier servi)
  // On ne supprime pas les autres validateurs en attente.

  // 3. Écriture de la signature (tableau + bandeau de fin) dans le Google Doc
  try {
    _insererSignatureDansTableau(idGoogleDoc, processus, emailValidateur, signatureId, maintenant);
    _ajouterBandeauSignature(idGoogleDoc, processus, emailValidateur, signatureId, maintenant);
    console.log(`[OK] Signatures (tableau + bandeau) écrites dans le document pour le processus : ${processus}`);
  } catch (err) {
    console.error(`[ERREUR] Écriture des signatures échouée : ${err.message}`);
    // Non bloquant : on continue même si l'écriture dans le doc a échoué
  }


  // 4. Vérification : tous les processus de ce document sont-ils finalisés ?
  //    (APPROUVÉ ou ANNULÉ — les EN_ATTENTE bloquent encore)
  const toutFinalise = _verifierValidationComplete(trackerSheet, refDoc);

  if (toutFinalise) {
    console.log(`[OK] Tous les processus de ${refDoc} sont finalisés — génération du PDF.`);
    _genererPdfFinal(idGoogleDoc, refDoc, nomClient, emailDeposant, nomDeposant);
  }
}

/**
 * Annule (statut ANNULÉ) toutes les lignes EN_ATTENTE du même document + processus
 * dont le Signature_ID est différent de celui qui vient d'approuver.
 * Cela évite qu'un deuxième validateur puisse encore approuver le même processus.
 */
function _annulerAutresValidateurs(trackerSheet, donnees, refDoc, processus, signatureIdApprouve) {
  for (let i = 1; i < donnees.length; i++) {
    if (
      donnees[i][COL.REF_DOC]       === refDoc &&
      donnees[i][COL.PROCESSUS]     === processus &&
      donnees[i][COL.SIGNATURE_ID]  !== signatureIdApprouve &&
      donnees[i][COL.STATUT]        === STATUT.EN_ATTENTE
    ) {
      trackerSheet.getRange(i + 1, COL.STATUT + 1).setValue(STATUT.ANNULE);
      console.log(`[OK] Signature annulée (processus déjà approuvé) : ${donnees[i][COL.SIGNATURE_ID]}`);
    }
  }
}

/**
 * Ouvre le Google Doc et insère les informations de signature dans le tableau HISTORIQUE DES RÉVISIONS.
 *
 * Stratégie de recherche : on parcourt tous les tableaux du document pour trouver
 * celui dont la première cellule contient "HISTORIQUE" — plus robuste que de supposer tables[0].
 *
 * Pour la ligne du processus : on cherche la première ligne dont la colonne PROCESSUS
 * correspond ET dont la colonne VALIDEUR est vide (pour ne pas écraser un historique existant).
 *
 * Colonnes du tableau HISTORIQUE (0-based) :
 *   0 : PROCESSUS   1 : DATE   2 : CONTENU MAJ   3 : RÉDACTEUR   4 : VALIDEUR   5 : N° REVISION
 */
function _insererSignatureDansTableau(idGoogleDoc, nomProcessus, emailValidateur, signatureId, dateValidation) {
  const doc  = DocumentApp.openById(idGoogleDoc);
  const body = doc.getBody();

  // Recherche du tableau HISTORIQUE DES RÉVISIONS
  const tableHistorique = _trouverTableauHistorique(body);
  if (!tableHistorique) {
    throw new Error('Tableau HISTORIQUE DES RÉVISIONS introuvable dans le document.');
  }

  const nomProcessusNormalise = nomProcessus.trim().toUpperCase();
  const dateStr = Utilities.formatDate(dateValidation, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const texteValideur = `${emailValidateur}\n${signatureId}`;

  let ligneEcrite = false;
  const numRows = tableHistorique.getNumRows();

  for (let i = 1; i < numRows; i++) {
    const cellProcessus = tableHistorique.getCell(i, 0).getText().trim().toUpperCase();

    if (cellProcessus === nomProcessusNormalise) {
      // On cherche une ligne avec la colonne VALIDEUR (col 4) encore vide
      const valideurExistant = tableHistorique.getCell(i, 4).getText().trim();
      if (!valideurExistant) {
        tableHistorique.getCell(i, 1).setText(dateStr);                    // DATE
        tableHistorique.getCell(i, 4).setText(texteValideur);             // VALIDEUR
        ligneEcrite = true;
        break;
      }
    }
  }

  if (!ligneEcrite) {
    // Aucune ligne vide trouvée : on insère une nouvelle ligne sous la dernière ligne du processus
    const derniereIndex = _trouverDerniereIndexProcessus(tableHistorique, nomProcessusNormalise, numRows);
    if (derniereIndex >= 0) {
      tableHistorique.insertRows(derniereIndex + 1, 1);
      tableHistorique.getCell(derniereIndex + 1, 0).setText(nomProcessus);
      tableHistorique.getCell(derniereIndex + 1, 1).setText(dateStr);
      tableHistorique.getCell(derniereIndex + 1, 4).setText(texteValideur);
      ligneEcrite = true;
    }
  }

  doc.saveAndClose();

  if (!ligneEcrite) {
    console.warn(`[WARN] Processus "${nomProcessus}" non trouvé dans le tableau HISTORIQUE.`);
  }
}

/**
 * Parcourt les tableaux du document pour trouver celui qui contient "HISTORIQUE" dans sa première cellule.
 * @returns {GoogleAppsScript.Document.Table|null}
 */
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

/**
 * Retourne l'index de la dernière ligne du tableau correspondant au processus donné.
 */
function _trouverDerniereIndexProcessus(table, nomProcessusNormalise, numRows) {
  let dernierIndex = -1;
  for (let i = 1; i < numRows; i++) {
    if (table.getCell(i, 0).getText().trim().toUpperCase() === nomProcessusNormalise) {
      dernierIndex = i;
    }
  }
  return dernierIndex;
}

// ================================================================
// TRAITEMENT REFUS
// ================================================================

function _traiterRefus(
  trackerSheet, rowSheet,
  refDoc, processus, emailValidateur, motifRefus,
  emailDeposant, nomDeposant
) {
  trackerSheet.getRange(rowSheet, COL.STATUT + 1).setValue(STATUT.REFUSE);
  trackerSheet.getRange(rowSheet, COL.DATE_VALIDATION + 1).setValue(new Date());

  MailApp.sendEmail({
    to: emailDeposant,
    subject: `[REFUS] ${refDoc} — Processus : ${processus}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif; color:#1a1a1a; max-width:600px;">
        <p>Bonjour ${nomDeposant},</p>
        <p>Le processus <strong>${processus}</strong> de la fiche <strong>${refDoc}</strong> a été <strong style="color:#c0392b;">refusé</strong>.</p>
        <table style="border-collapse:collapse; width:100%; margin:16px 0;">
          <tr>
            <td style="padding:8px 12px; background:#f8f8f8; border:1px solid #ddd; font-weight:bold; width:160px;">Validateur</td>
            <td style="padding:8px 12px; border:1px solid #ddd;">${emailValidateur}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; background:#f8f8f8; border:1px solid #ddd; font-weight:bold;">Motif</td>
            <td style="padding:8px 12px; border:1px solid #ddd;">${motifRefus || 'Non précisé'}</td>
          </tr>
        </table>
        <p>Veuillez corriger le document et soumettre une nouvelle révision avec un numéro de révision incrémenté.</p>
      </div>
    `,
  });

  console.log(`[OK] Refus enregistré : ${refDoc} — ${processus} — par ${emailValidateur}`);
}

// ================================================================
// FINALISATION : VÉRIFICATION + GÉNÉRATION PDF
// ================================================================

/**
 * Vérifie si tous les processus du document référencé ont atteint un statut final
 * (APPROUVÉ ou ANNULÉ). Les lignes EN_ATTENTE bloquent la génération du PDF.
 */
function _verifierValidationComplete(trackerSheet, refDoc) {
  const donnees = trackerSheet.getDataRange().getValues();
  for (let i = 1; i < donnees.length; i++) {
    if (donnees[i][COL.REF_DOC] !== refDoc) continue;
    const statut = donnees[i][COL.STATUT];
    if (statut === STATUT.EN_ATTENTE) return false;
    // Un refus bloque aussi la génération → le déposant doit corriger et resoumettre
    if (statut === STATUT.REFUSE)     return false;
  }
  return true;
}

/**
 * Convertit le Google Doc en PDF, crée le sous-dossier client si nécessaire,
 * dépose le PDF dans "03 - Fiches Validées", et notifie le déposant.
 */
function _genererPdfFinal(idGoogleDoc, refDoc, nomClient, emailDeposant, nomDeposant) {
  // Export PDF depuis le Google Doc
  const pdfBlob = DriveApp.getFileById(idGoogleDoc).getAs('application/pdf');
  pdfBlob.setName(`[VALIDÉ] ${refDoc}.pdf`);

  // Récupération du dossier "03 - Fiches Validées"
  const dossierSylob = DriveApp.getFolderById(CFG.ID_DOSSIER_SYLOB);

  // Sous-dossier client : création si inexistant
  let dossierClient;
  const iterateur = dossierSylob.getFoldersByName(nomClient);
  if (iterateur.hasNext()) {
    dossierClient = iterateur.next();
  } else {
    dossierClient = dossierSylob.createFolder(nomClient);
    console.log(`[OK] Sous-dossier client créé : "${nomClient}"`);
  }

  // Dépôt du PDF
  const pdfCree = dossierClient.createFile(pdfBlob);
  console.log(`[OK] PDF déposé : ${pdfCree.getUrl()}`);

  // Notification au déposant
  MailApp.sendEmail({
    to: emailDeposant,
    subject: `[VALIDÉ ✓] ${refDoc} — Tous les processus approuvés`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif; color:#1a1a1a; max-width:600px;">
        <p>Bonjour ${nomDeposant},</p>
        <p>🎉 Tous les processus de la fiche <strong>${refDoc}</strong> ont été approuvés.</p>
        <p>Le PDF final a été déposé dans le dossier client <strong>${nomClient}</strong> (03 - Fiches Validées).</p>
        <p>
          <a href="${pdfCree.getUrl()}"
             style="display:inline-block; background:#1a56db; color:white; padding:8px 18px;
                    text-decoration:none; border-radius:5px;">
            📄 Accéder au PDF validé
          </a>
        </p>
        <p style="font-size:12px; color:#888; margin-top:24px;">
          Ce PDF peut maintenant être importé dans Sylob.
        </p>
      </div>
    `,
  });
}

/**
 * Ajoute un bloc de signature visuel (bandeau) à la fin du document Google Doc.
 * Ce bloc matérialise la validation au fer rouge de manière esthétique.
 *
 * @param {string} idGoogleDoc - ID du Google Doc de travail
 * @param {string} nomProcessus - Libellé du processus validé
 * @param {string} emailValidateur - Email du validateur
 * @param {string} signatureId - ID unique de signature (ex: SIG-20260528-XXXX)
 * @param {Date}   dateValidation - Date de signature
 */
function _ajouterBandeauSignature(idGoogleDoc, nomProcessus, emailValidateur, signatureId, dateValidation) {
  const doc = DocumentApp.openById(idGoogleDoc);
  const body = doc.getBody();

  // 1. Ligne de séparation visuelle
  body.appendHorizontalRule();

  // 2. Titre du bloc
  const titre = body.appendParagraph("📝 SIGNATURE ÉLECTRONIQUE VALIDE");
  titre.setHeading(DocumentApp.ParagraphHeading.HEADING3);
  
  // Formatage de la date en local (heure française de TB Groupe)
  const dateStr = Utilities.formatDate(dateValidation, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

  // 3. Contenu du bandeau
  body.appendParagraph(`Processus validé : ${nomProcessus}`).setBold(true);
  body.appendParagraph(`Signataire : ${emailValidateur}`);
  body.appendParagraph(`Date & Heure : ${dateStr}`);
  
  const pSig = body.appendParagraph(`Identifiant de signature : ${signatureId}`);
  pSig.setFontFamily("Courier New"); // Police machine à écrire pour l'aspect technique
  
  doc.saveAndClose();
}

