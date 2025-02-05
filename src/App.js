// App.js
import React, { useState, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useParams,
} from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import {
  Container,
  Typography,
  Box,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  FormControlLabel,
  Card,
  CardContent,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// Lese die Supabase‑URL und den Anon‑Key aus der .env-Datei
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Dashboard – Ersteller-Bereich (User1)
 *
 * 1. User1 erstellt den Einkaufszettel, trägt Artikel inkl. Preis ein
 *    und kann zusätzlich per Checkbox angeben, welche Artikel er selbst
 *    nicht mitzahlen möchte.
 * 2. Es wird ein Einladungslink generiert, den er an seine Freunde teilt.
 * 3. Sobald alle Freunde (participant_count - 1) geantwortet haben, kann
 *    er per Button die Ergebnisse berechnen.
 * 4. In der Ergebnisanzeige (Aufteilung) wird per Accordion aufklappbar
 *    dargestellt, wer welche Artikel (also "abgehakt") hat.
 * 5. Abschließend kann der Kassenzettel geschlossen werden (Items werden gelöscht).
 */
function Dashboard() {
  const [shoppingListId, setShoppingListId] = useState(null);
  const [participantCount, setParticipantCount] = useState('');
  const [listCreated, setListCreated] = useState(false);
  const [newItem, setNewItem] = useState({ description: '', price: '' });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Zusätzliche State für die Auswahl des Creators:
  // Hier wird festgehalten, welche Artikel der Creator ausschließen möchte.
  const [creatorSelected, setCreatorSelected] = useState({});

  // Zustände für Freundesantworten und Ergebnisrechnung
  const [responses, setResponses] = useState([]);
  const [results, setResults] = useState(null);
  const [receiptClosed, setReceiptClosed] = useState(false);

  // Einkaufszettel erstellen
  const createList = async (e) => {
    e.preventDefault();
    if (!participantCount || parseInt(participantCount) <= 0) return;
    const { data, error } = await supabase
        .from('shopping_lists')
        .insert([{ participant_count: parseInt(participantCount), created_at: new Date() }])
        .select();
    if (error) {
      console.error('Error creating list:', error);
    } else {
      setShoppingListId(data[0].id);
      setListCreated(true);
    }
  };

  // Eingabewerte für neuen Artikel aktualisieren
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewItem((prev) => ({ ...prev, [name]: value }));
  };

  // Neuen Artikel hinzufügen
  const addItem = async (e) => {
    e.preventDefault();
    if (!newItem.description || !newItem.price) return;
    setLoading(true);
    const { data, error } = await supabase
        .from('shopping_items')
        .insert([
          {
            shopping_list_id: shoppingListId,
            description: newItem.description,
            price: parseFloat(newItem.price),
          },
        ])
        .select();
    if (error) {
      console.error('Error adding item:', error);
    } else {
      // Artikel zur Liste hinzufügen
      setItems((prev) => [...prev, data[0]]);
      // Initialisiere die Checkbox-Auswahl für den Creator (Standard: zahlt mit)
      setCreatorSelected((prev) => ({ ...prev, [data[0].id]: false }));
      setNewItem({ description: '', price: '' });
    }
    setLoading(false);
  };

  // Handler für die Checkbox des Creators
  const handleCreatorCheckboxChange = (itemId) => {
    setCreatorSelected((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // Erzeuge den sharebaren Link
  const shareableLink = shoppingListId
      ? `${window.location.origin}/split/${shoppingListId}`
      : '';

  // Antworten der Freunde aus der Datenbank abrufen
  const fetchResponses = async () => {
    if (!shoppingListId) return;
    const { data, error } = await supabase
        .from('shopping_responses')
        .select('*')
        .eq('shopping_list_id', shoppingListId);
    if (error) {
      console.error('Error fetching responses:', error);
    } else {
      setResponses(data);
    }
  };

  // Ergebnisse berechnen (nur, wenn alle (participant_count - 1) Antworten vorliegen)
  const calculateResults = () => {
    const expectedResponses = parseInt(participantCount) - 1; // der Ersteller zählt nicht mit
    if (responses.length !== expectedResponses) {
      alert(
          `Es wurden noch nicht alle Antworten abgegeben. Erwartet: ${expectedResponses}, erhalten: ${responses.length}`
      );
      return;
    }
    // Initialisiere Ergebnisobjekt mit dem Creator und allen Freundesnamen
    const resultTotals = { Creator: 0 };
    responses.forEach((response) => {
      resultTotals[response.friend_name] = 0;
    });

    // Für jeden Artikel ermitteln, wer zahlt:
    // Prüfe sowohl den Creator (über creatorSelected) als auch die Freundesantworten.
    items.forEach((item) => {
      let payingParticipants = [];
      // Der Creator zahlt, wenn er das Item nicht ausgeschaltet hat.
      if (!creatorSelected[item.id]) {
        payingParticipants.push('Creator');
      }
      // Für jeden Freund: Falls das Item nicht in der "nicht zahlen"-Liste enthalten ist, zahlt er mit.
      responses.forEach((response) => {
        if (!response.not_pay_item_ids.includes(item.id)) {
          payingParticipants.push(response.friend_name);
        }
      });
      if (payingParticipants.length > 0) {
        const share = item.price / payingParticipants.length;
        payingParticipants.forEach((participant) => {
          resultTotals[participant] += share;
        });
      }
    });
    setResults(resultTotals);
  };

  // Kassenzettel schließen – löscht alle Artikel des Einkaufszettels
  const closeReceipt = async () => {
    if (!shoppingListId) return;
    const { error } = await supabase
        .from('shopping_items')
        .delete()
        .eq('shopping_list_id', shoppingListId);
    if (error) {
      console.error('Error closing receipt:', error);
    } else {
      setReceiptClosed(true);
    }
  };

  return (
      <Container maxWidth="sm" sx={{ padding: '20px' }}>
        <Typography variant="h4" gutterBottom>
          ShoppingSplitter Dashboard
        </Typography>
        {!listCreated ? (
            <Box component="form" onSubmit={createList} sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                Einkaufszettel erstellen
              </Typography>
              <TextField
                  label="Anzahl der Teilnehmer"
                  type="number"
                  value={participantCount}
                  onChange={(e) => setParticipantCount(e.target.value)}
                  fullWidth
                  margin="normal"
                  inputProps={{ min: 1 }}
              />
              <Button type="submit" variant="contained" color="primary">
                Erstellen
              </Button>
            </Box>
        ) : (
            <Box sx={{ mt: 2 }}>
              {!receiptClosed && (
                  <>
                    <Box component="form" onSubmit={addItem} sx={{ mb: 2 }}>
                      <Typography variant="h6" gutterBottom>
                        Neuen Artikel hinzufügen
                      </Typography>
                      <TextField
                          label="Artikelbeschreibung"
                          name="description"
                          value={newItem.description}
                          onChange={handleInputChange}
                          fullWidth
                          margin="normal"
                      />
                      <TextField
                          label="Preis"
                          name="price"
                          type="number"
                          value={newItem.price}
                          onChange={handleInputChange}
                          fullWidth
                          margin="normal"
                          inputProps={{ step: '0.01' }}
                      />
                      <Button type="submit" variant="contained" color="primary" disabled={loading}>
                        Hinzufügen
                      </Button>
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Artikel Liste
                    </Typography>
                    {items.length > 0 ? (
                        <List>
                          {items.map((item) => (
                              <ListItem key={item.id}>
                                <ListItemText
                                    primary={item.description}
                                    secondary={`${item.price.toFixed(2)} €`}
                                />
                              </ListItem>
                          ))}
                        </List>
                    ) : (
                        <Typography variant="body1">Noch keine Artikel hinzugefügt.</Typography>
                    )}
                    <Divider sx={{ my: 2 }} />
                    {/* Hier kann der Creator auswählen, welche Artikel er nicht mitzahlen möchte */}
                    <Typography variant="h6" gutterBottom>
                      Wähle Artikel, die du <strong>nicht</strong> mitzahlen möchtest:
                    </Typography>
                    {items.length > 0 && (
                        <List>
                          {items.map((item) => (
                              <ListItem key={item.id}>
                                <ListItemText
                                    primary={item.description}
                                    secondary={`${item.price.toFixed(2)} €`}
                                />
                                <FormControlLabel
                                    control={
                                      <Checkbox
                                          checked={creatorSelected[item.id] || false}
                                          onChange={() => handleCreatorCheckboxChange(item.id)}
                                      />
                                    }
                                    label="Ich zahle nicht"
                                />
                              </ListItem>
                          ))}
                        </List>
                    )}
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Einladungslink
                    </Typography>
                    <Typography variant="body1">
                      Teile diesen Link mit Deinen Freunden:
                    </Typography>
                    <Card variant="outlined" sx={{ mt: 1 }}>
                      <CardContent>
                        <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                          {shareableLink}
                        </Typography>
                      </CardContent>
                    </Card>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Antworten der Freunde
                    </Typography>
                    <Button variant="contained" color="secondary" onClick={fetchResponses} sx={{ mb: 2 }}>
                      Antworten aktualisieren
                    </Button>
                    <Typography variant="body2">
                      {responses.length} von {parseInt(participantCount) - 1} Antworten erhalten.
                    </Typography>
                    {responses.length === parseInt(participantCount) - 1 && (
                        <Button variant="contained" color="primary" onClick={calculateResults} sx={{ mt: 2 }}>
                          Ergebnisse berechnen
                        </Button>
                    )}
                    {results && (
                        <>
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="h6">Aufteilung:</Typography>
                            <Table>
                              <TableHead>
                                <TableRow>
                                  <TableCell>Teilnehmer</TableCell>
                                  <TableCell align="right">Betrag (€)</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {Object.entries(results).map(([participant, amount]) => (
                                    <TableRow key={participant}>
                                      <TableCell>{participant}</TableCell>
                                      <TableCell align="right">{amount.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </Box>
                          {/* Neuer Abschnitt: Aufklappbare Details zu den Antworten */}
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="h6">Details der Antworten:</Typography>
                            {[
                              {
                                name: 'Creator',
                                excludedItems: items.filter((item) => creatorSelected[item.id]),
                              },
                              ...responses.map((response) => ({
                                name: response.friend_name,
                                excludedItems: items.filter((item) =>
                                    response.not_pay_item_ids.includes(item.id)
                                ),
                              })),
                            ].map((participant, index) => (
                                <Accordion key={index}>
                                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography>
                                      {participant.name} (Betrag: {results[participant.name]?.toFixed(2)} €)
                                    </Typography>
                                  </AccordionSummary>
                                  <AccordionDetails>
                                    {participant.excludedItems.length > 0 ? (
                                        <List>
                                          {participant.excludedItems.map((item) => (
                                              <ListItem key={item.id}>
                                                <ListItemText
                                                    primary={item.description}
                                                    secondary={`${item.price.toFixed(2)} €`}
                                                />
                                              </ListItem>
                                          ))}
                                        </List>
                                    ) : (
                                        <Typography variant="body2">Keine Artikel ausgeschlossen.</Typography>
                                    )}
                                  </AccordionDetails>
                                </Accordion>
                            ))}
                          </Box>
                          <Box sx={{ mt: 2 }}>
                            <Button variant="contained" color="error" onClick={closeReceipt}>
                              Kassenzettel schließen
                            </Button>
                          </Box>
                        </>
                    )}
                  </>
              )}
              {receiptClosed && (
                  <Typography variant="h6" color="error" sx={{ mt: 2 }}>
                    Der Kassenzettel wurde geschlossen.
                  </Typography>
              )}
            </Box>
        )}
      </Container>
  );
}

/**
 * FriendSplit – Freund‑Ansicht (User2/3)
 *
 * 1. Der Freund öffnet den Einladungslink, gibt seinen Namen ein.
 * 2. Anschließend sieht er eine Liste der Artikel (ohne Preisangabe) und
 *    kann per Checkbox markieren, bei welchen Artikeln er nicht mitzahlen möchte.
 * 3. Mit Klick auf "Fertigstellen" wird seine Antwort (Name und opt-out‑Liste)
 *    in der Tabelle shopping_responses gespeichert.
 */
function FriendSplit() {
  const { id } = useParams();
  const [shoppingList, setShoppingList] = useState(null);
  const [items, setItems] = useState([]);
  const [friendName, setFriendName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [selected, setSelected] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      // Einkaufszettel laden
      const { data: listData, error: listError } = await supabase
          .from('shopping_lists')
          .select('*')
          .eq('id', id)
          .single();
      if (listError) {
        console.error('Error fetching list:', listError);
      } else {
        setShoppingList(listData);
      }
      // Artikel laden
      const { data: itemsData, error: itemsError } = await supabase
          .from('shopping_items')
          .select('*')
          .eq('shopping_list_id', id);
      if (itemsError) {
        console.error('Error fetching items:', itemsError);
      } else {
        setItems(itemsData);
        // Initialisiere die Checkboxen (Standard: false, d.h. "ich zahle mit")
        const initSelected = {};
        itemsData.forEach((item) => {
          initSelected[item.id] = false;
        });
        setSelected(initSelected);
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleCheckboxChange = (itemId) => {
    setSelected((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (friendName.trim() !== '') {
      setNameSubmitted(true);
    }
  };

  const submitResponse = async () => {
    // Erzeuge ein Array der Item-IDs, bei denen der Freund "ich zahle nicht" ausgewählt hat
    const notPayItemIds = Object.entries(selected)
        .filter(([itemId, value]) => value)
        .map(([itemId]) => parseInt(itemId));
    const { error } = await supabase
        .from('shopping_responses')
        .insert([
          {
            shopping_list_id: id,
            friend_name: friendName,
            not_pay_item_ids: notPayItemIds,
          },
        ]);
    if (error) {
      console.error('Error submitting response:', error);
    } else {
      setSubmitted(true);
    }
  };

  if (loading) {
    return (
        <Container maxWidth="sm" sx={{ padding: '20px' }}>
          <Typography variant="h6">Lade Daten...</Typography>
        </Container>
    );
  }

  if (submitted) {
    return (
        <Container maxWidth="sm" sx={{ padding: '20px' }}>
          <Typography variant="h4" gutterBottom>
            Vielen Dank!
          </Typography>
          <Typography variant="body1">
            Deine Antwort wurde eingereicht.
          </Typography>
        </Container>
    );
  }

  return (
      <Container maxWidth="sm" sx={{ padding: '20px' }}>
        <Typography variant="h4" gutterBottom>
          ShoppingSplitter – Dein Anteil
        </Typography>
        {!nameSubmitted ? (
            <Box component="form" onSubmit={handleNameSubmit}>
              <Typography variant="h6" gutterBottom>
                Bitte gib deinen Namen ein:
              </Typography>
              <TextField
                  label="Name"
                  value={friendName}
                  onChange={(e) => setFriendName(e.target.value)}
                  fullWidth
                  margin="normal"
              />
              <Button type="submit" variant="contained" color="primary">
                Bestätigen
              </Button>
            </Box>
        ) : (
            <>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                Wähle die Artikel, die du <strong>nicht</strong> mitzahlen möchtest:
              </Typography>
              {items.length > 0 ? (
                  <List>
                    {items.map((item) => (
                        <ListItem key={item.id}>
                          <ListItemText primary={item.description} />
                          <FormControlLabel
                              control={
                                <Checkbox
                                    checked={selected[item.id] || false}
                                    onChange={() => handleCheckboxChange(item.id)}
                                />
                              }
                              label="Ich zahle nicht"
                          />
                        </ListItem>
                    ))}
                  </List>
              ) : (
                  <Typography variant="body1">Keine Artikel gefunden.</Typography>
              )}
              <Button variant="contained" color="primary" onClick={submitResponse} sx={{ mt: 2 }}>
                Fertigstellen
              </Button>
            </>
        )}
      </Container>
  );
}

/**
 * App-Komponente mit React Router:
 * "/" zeigt das Dashboard (User1), "/split/:id" die Freund‑Ansicht (User2/3).
 */
function App() {
  return (
      <Router>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/split/:id" element={<FriendSplit />} />
        </Routes>
      </Router>
  );
}

export default App;
