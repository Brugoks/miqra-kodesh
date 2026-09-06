// Interpretive waterfront district, not a surveyed reconstruction of the city.
export const CAESAREA = {
  slug: 'caesarea', placeSlug: 'caesarea', title: 'Caesarea Maritima',
  subtitle: 'Paul’s witness before kings · Acts 23–27 · first century AD',
  blurb: 'Beyond Jerusalem, the road to Rome began beside the sea. Explore a sunlit waterfront of ships, colonnades and courtyards in the city where Cornelius welcomed Peter, Philip received Paul, and a prisoner spoke before governors and a king.',
  disclaimer: 'An artist’s reconstruction. Acts supplies the events; this compact waterfront is an illustrative composition, not a surveyed city plan. Houses, hearing rooms, ships and their positions are conjectural. Earlier events are recalled within a first-century setting.',
  // -Z is south, +X is east — see the axis note in caesareaDimensions.js.
  geo: { lat: 32.4995, lon: 34.8922, bearing: 180, xAxis: 90 },
  defaultVantage: 'waterfront',
  vantages: [
    { id: 'waterfront', label: 'The Waterfront', position: [30, 3.7, 12], lookAt: [-95, 8, 35], blurb: 'Step out of the shade toward the Mediterranean. Caesarea links several journeys in Acts; this waterfront evokes that world rather than reproducing a particular ancient quay.', refs: ['Acts 18:22', 'Acts 21:8'] },
    { id: 'harbor-view', label: 'The Harbor', position: [8, 3.7, 45], lookAt: [-85, 8, 50], blurb: 'Paul’s friends brought him to Caesarea and sent him toward Tarsus. Ships made this city a threshold between Judea and the wider Mediterranean.', refs: ['Acts 9:30'] },
    { id: 'palace-view', label: 'Before Governors', position: [10, 3.7, -65], lookAt: [38, 10, -70], blurb: 'Paul was kept in Herod’s praetorium. His defenses before Felix, Festus and Agrippa occupy Acts 24–26. This government precinct is an interpretive setting, not an identified hearing room.', refs: ['Acts 23:33-35', 'Acts 24:24-27', 'Acts 26:1-29'] },
    { id: 'household-view', label: 'An Open Household', position: [60, 3.7, 60], lookAt: [72, 5, 65], blurb: 'Cornelius gathered his household to hear Peter. Years later, Philip welcomed Paul. This imagined domestic courtyard recalls both stories without claiming to locate either home.', refs: ['Acts 10:24-48', 'Acts 21:8-14'] },
    { id: 'departure-view', label: 'Toward Rome', position: [4, 3.7, 82], lookAt: [-25, 7, 80], blurb: 'After Paul’s hearings in Caesarea, Acts follows him aboard a ship of Adramyttium under the centurion Julius. The voyage toward Italy begins—not yet aboard the Alexandrian ship encountered at Myra.', refs: ['Acts 27:1-6'] },
  ],
  hotspots: [
    { id: 'sebastos', label: 'A Mediterranean Port', position: [-90, 8, 45], maxDistance: 230, body: 'Sea routes connect the episodes in Acts. The harbor, breakwaters and anchored vessels here are a visual interpretation of a Roman-era port, not measured reproductions of their first-century positions.', refs: ['Acts 9:30', 'Acts 18:22'] },
    { id: 'praetorium', label: 'Herod’s Praetorium', position: [40, 14, -70], maxDistance: 130, body: 'Acts explicitly places Paul in Herod’s praetorium after his escort arrives in Caesarea. The exact room and its appearance are not supplied by the text. The palace facade here marks the story, not a proven cell.', refs: ['Acts 23:33-35'] },
    { id: 'testimony', label: 'A Prisoner’s Testimony', position: [39, 6, -49], maxDistance: 85, body: 'Paul tells Agrippa how the risen Jesus confronted him on the road and commissioned him as a witness. Read the whole defense rather than treating this imagined architecture as evidence for the room.', refs: ['Acts 26:1-29'] },
    { id: 'cornelius', label: 'Cornelius Welcomes Peter', position: [73, 7, 69], maxDistance: 95, body: 'Cornelius, a centurion in Caesarea, gathers relatives and close friends. While Peter speaks, the Holy Spirit falls on the listeners. This house is illustrative; no identification of Cornelius’s home is claimed.', refs: ['Acts 10:1-8', 'Acts 10:24-48', 'Acts 11:1-18'] },
    { id: 'philip', label: 'Philip and His Daughters', position: [49, 6, 87], maxDistance: 80, body: 'Paul stays with Philip the evangelist, who has four unmarried daughters who prophesy. Agabus arrives from Judea and foretells Paul’s binding in Jerusalem. The nearby houses suggest a domestic setting, not the recovered house of Philip.', refs: ['Acts 21:8-14'] },
    { id: 'departure', label: 'The Voyage Begins', position: [-25, 9, 80], maxDistance: 135, body: 'Julius takes charge of Paul and other prisoners. They board a ship of Adramyttium bound for ports along Asia’s coast. The vessel shown is a conjectural merchant ship, not a reconstruction of Paul’s actual ship.', refs: ['Acts 27:1-6'] },
  ],
};
