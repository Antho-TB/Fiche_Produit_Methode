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
  EMAIL_VALID:     1,  // Votre adresse email (colonne B)
  SIGNATURE_ID:    2,  // Identifiant de signature (colonne C)
  APPROUVES:       3,  // Processus approuvé(s) (colonne D)
  REFUSES:         4,  // Processus refusé(s) (colonne E)
  MOTIF_REFUS:     5,  // Motif du refus (colonne F)
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
  ANNULE:     'ANNULÉ',
};

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

    if (valeurs.length < 3) {
      const msg = `[ERREUR] Le formulaire de décision n'a pas assez de colonnes (reçu : ${valeurs.length}, attendu : 3 minimum).`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    const signatureId     = valeurs[FORM2.SIGNATURE_ID] ? valeurs[FORM2.SIGNATURE_ID].trim() : '';
    const approuvesRaw    = valeurs[FORM2.APPROUVES] || '';
    const refusesRaw      = valeurs[FORM2.REFUSES] || '';
    const motifRefus      = valeurs[FORM2.MOTIF_REFUS] || '';

    if (!signatureId) {
      const msg = '[ERREUR] Signature ID manquant dans la réponse du formulaire.';
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    // Parsing des choix (le format de Google Forms pour les cases à cocher est une chaîne séparée par des virgules)
    const approuves = approuvesRaw.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
    const refuses   = refusesRaw.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);

    _logToSheet("INFO", `Recherche des processus en attente pour la signature : ${signatureId} dans le Tracker...`);

    // Chargement du Tracker
    const trackerSpreadsheet = SpreadsheetApp.openById(CFG.ID_SHEET_TRACKER);
    const trackerSheet = trackerSpreadsheet.getSheetByName(CFG.NOM_ONGLET_TRACKER);
    const donnees = trackerSheet.getDataRange().getValues();

    // Recherche de toutes les lignes correspondantes en attente
    const lignesAModifier = [];
    for (let i = 1; i < donnees.length; i++) {
      if (
        donnees[i][COL.SIGNATURE_ID] === signatureId &&
        donnees[i][COL.STATUT] === STATUT.EN_ATTENTE
      ) {
        lignesAModifier.push({
          rowIndex: i + 1,
          processus: donnees[i][COL.PROCESSUS],
          emailValidateur: donnees[i][COL.EMAIL_VALID],
          refDoc: donnees[i][COL.REF_DOC],
          nomClient: donnees[i][COL.CLIENT],
          idGoogleDoc: donnees[i][COL.GOOGLE_DOC_ID],
          emailDeposant: donnees[i][COL.EMAIL_DEPOSANT],
          nomDeposant: donnees[i][COL.NOM_DEPOSANT]
        });
      }
    }

    if (lignesAModifier.length === 0) {
      const msg = `[WARN] Aucun processus en attente trouvé pour l'ID de signature : ${signatureId}`;
      console.warn(msg);
      _logToSheet("WARN", msg);
      return;
    }

    const documentsAValider = new Set();
    const maintenant = new Date();

    lignesAModifier.forEach(ligne => {
      const procUpper = ligne.processus.toUpperCase();
      documentsAValider.add(ligne.refDoc);

      if (approuves.includes(procUpper)) {
        _logToSheet("INFO", `Décision : Approbation pour ${ligne.processus} sur ${ligne.refDoc}`);
        
        // 1. Mise à jour du Tracker
        trackerSheet.getRange(ligne.rowIndex, COL.STATUT + 1).setValue(STATUT.APPROUVE);
        trackerSheet.getRange(ligne.rowIndex, COL.DATE_VALIDATION + 1).setValue(maintenant);

        // 2. Écriture de la signature dans le Google Doc
        try {
          const match = ligne.refDoc.match(/-REV(\d+)/i);
          const noRevision = match ? match[1] : '001';
          _insererSignatureDansTableau(ligne.idGoogleDoc, ligne.processus, ligne.emailValidateur, signatureId, maintenant, noRevision);
          _logToSheet("INFO", `Signature écrite pour ${ligne.processus} (Rév: ${noRevision})`);
        } catch (err) {
          _logToSheet("ERREUR", `Écriture signature échouée pour ${ligne.processus} : ${err.message}`);
        }
      } else if (refuses.includes(procUpper)) {
        _logToSheet("INFO", `Décision : Refus pour ${ligne.processus} sur ${ligne.refDoc}`);
        
        // 1. Mise à jour du Tracker
        trackerSheet.getRange(ligne.rowIndex, COL.STATUT + 1).setValue(STATUT.REFUSE);
        trackerSheet.getRange(ligne.rowIndex, COL.DATE_VALIDATION + 1).setValue(maintenant);

        // 2. Notification de refus au déposant
        _envoyerEmailRefus(ligne.refDoc, ligne.processus, ligne.emailValidateur, motifRefus, ligne.emailDeposant, ligne.nomDeposant);
      } else {
        _logToSheet("WARN", `Le processus ${ligne.processus} n'a pas été sélectionné dans les réponses. Laissé en attente.`);
      }
    });

    // 3. Vérification de finalisation par document
    documentsAValider.forEach(refDoc => {
      const toutFinalise = _verifierValidationComplete(trackerSheet, refDoc);
      if (toutFinalise) {
        _logToSheet("INFO", `[OK] Tous les processus de ${refDoc} sont approuvés — génération du PDF.`);
        const metadata = lignesAModifier.find(l => l.refDoc === refDoc);
        if (metadata) {
          _genererPdfFinal(metadata.idGoogleDoc, refDoc, metadata.nomClient, metadata.emailDeposant, metadata.nomDeposant);
        }
      }
    });
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
// FONCTIONS UTILITAIRES
// ================================================================

function _envoyerEmailRefus(refDoc, processus, emailValidateur, motifRefus, emailDeposant, nomDeposant) {
  MailApp.sendEmail({
    to: emailDeposant,
    subject: `[REFUS] ${refDoc} — Processus : ${processus}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif; color:#1a1a1a; max-width:600px; line-height: 1.5;">
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
        <p>Veuillez corriger le document et soumettre une nouvelle révision.</p>
      </div>
    `,
  });
}

function _verifierValidationComplete(trackerSheet, refDoc) {
  const donnees = trackerSheet.getDataRange().getValues();
  for (let i = 1; i < donnees.length; i++) {
    if (donnees[i][COL.REF_DOC] !== refDoc) continue;
    const statut = donnees[i][COL.STATUT];
    if (statut === STATUT.EN_ATTENTE || statut === STATUT.REFUSE) return false;
  }
  return true;
}

function _genererPdfFinal(idGoogleDoc, refDoc, nomClient, emailDeposant, nomDeposant) {
  const pdfBlob = DriveApp.getFileById(idGoogleDoc).getAs('application/pdf');
  pdfBlob.setName(`[VALIDÉ] ${refDoc}.pdf`);

  const dossierSylob = DriveApp.getFolderById(CFG.ID_DOSSIER_SYLOB);

  let dossierClient;
  const iterateur = dossierSylob.getFoldersByName(nomClient);
  if (iterateur.hasNext()) {
    dossierClient = iterateur.next();
  } else {
    dossierClient = dossierSylob.createFolder(nomClient);
    console.log(`[OK] Sous-dossier client créé : "${nomClient}"`);
  }

  const pdfCree = dossierClient.createFile(pdfBlob);
  console.log(`[OK] PDF déposé : ${pdfCree.getUrl()}`);

  // Notification au déposant
  MailApp.sendEmail({
    to: emailDeposant,
    subject: `[VALIDÉ ✓] ${refDoc} — Tous les processus approuvés`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif; color:#1a1a1a; max-width:600px; line-height: 1.5;">
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
      </div>
    `,
  });

  // Envoyé un mail a Sandrine seulement une fois que tout le monde a signé
  const EMAIL_SANDRINE = "s.guillemin@tb-groupe.fr";
  MailApp.sendEmail({
    to: EMAIL_SANDRINE,
    subject: `[PROD VALIDÉ ✓] ${refDoc} — Prêt pour Sylob`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif; color:#1a1a1a; max-width:600px; line-height: 1.5;">
        <p>Bonjour Sandrine,</p>
        <p>La validation de la fiche produit <strong>${refDoc}</strong> (Client : <strong>${nomClient}</strong>) est maintenant **complète**.</p>
        <p>Le document a été signé électroniquement par l'ensemble des décideurs concernés.</p>
        <p>Le PDF final a été automatiquement généré et classé dans le dossier client.</p>
        <div style="margin:20px 0;">
          <a href="${pdfCree.getUrl()}"
             style="display:inline-block; background:#22c55e; color:white; padding:10px 20px;
                    text-decoration:none; border-radius:5px; font-weight:bold;">
            Accéder au PDF Finalisé
          </a>
        </div>
        <p style="font-size:12px; color:#888;">
          Ce document est prêt pour intégration dans Sylob.
        </p>
      </div>
    `,
  });
}

// ================================================================
// INSCRIPTION DANS LE TABLEAU
// ================================================================

function _insererSignatureDansTableau(idGoogleDoc, nomProcessus, emailValidateur, signatureId, dateValidation, noRevision) {
  const doc  = DocumentApp.openById(idGoogleDoc);
  const body = doc.getBody();

  const tableHistorique = _trouverTableauHistorique(body);
  if (!tableHistorique) {
    throw new Error('Tableau HISTORIQUE DES RÉVISIONS introuvable.');
  }

  const nomProcessusNormalise = nomProcessus.trim().toUpperCase();
  const dateStr = Utilities.formatDate(dateValidation, Session.getScriptTimeZone(), 'dd/MM/yyyy');
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
 pSig = body.appendParagraph(`Identifiant de signature : ${signatureId}`);
  pSig.setFontFamily("Courier New"); // Police machine à écrire pour l'aspect technique
  
  doc.saveAndClose();
}

