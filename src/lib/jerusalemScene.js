import { eventFloorAt, surfaceHeight } from '../components/scene/jerusalemTopography';

const stance = (x, z, lift = 1.7) => [x, surfaceHeight(x, z) + lift, z];
const focus = (x, z, lift = 1.1) => [x, eventFloorAt(x, z) + lift, z];

export const JERUSALEM = {
  slug: 'jerusalem',
  placeSlug: 'jerusalem',
  title: 'Jerusalem: The Final Week',
  subtitle: 'Passover · c. AD 30',
  period: { label: 'c. AD 30', referenceYear: 30 },
  disclaimer:
    'An interactive, interpretive reconstruction. The Gospels name these events, but several exact locations and the first-century street plan remain debated; buildings and distances are shown to support reading, not as archaeological certainty.',
  blurb:
    'Walk from the eastern gate into the Temple courts, climb into the Upper City for the Passover meal, follow the hearings and the road beyond the wall, and arrive at the tomb on the first day of the week. Each staged moment is linked to Matthew, Mark and Luke so the city becomes a visual companion to the Synoptic Gospels.',
  geo: { lat: 31.778, lon: 35.2354, bearing: 0, xAxis: 90 },
  defaultVantage: 'eastern-gate',
  defaultEvent: 'entry-gate',
  eventsHeading: 'The final week in Jerusalem',
  scriptureJourney: {
    title: 'Follow the final week',
    defaultBookCode: 'MRK',
    books: [
      {
        bookCode: 'MAT', bookName: 'Matthew', defaultChapter: 21,
        chapters: [
          { number: 21, label: 'Entry and the Temple' },
          { number: 22, label: 'Questions in the courts' },
          { number: 23, label: 'Jesus addresses Jerusalem' },
          { number: 24, label: 'The Mount of Olives' },
          { number: 26, label: 'Passover, Gethsemane and arrest' },
          { number: 27, label: 'Trial, crucifixion and burial' },
          { number: 28, label: 'The empty tomb' },
        ],
      },
      {
        bookCode: 'MRK', bookName: 'Mark', defaultChapter: 11,
        chapters: [
          { number: 11, label: 'Entry and the Temple' },
          { number: 12, label: 'Teaching and the widow' },
          { number: 13, label: 'The Mount of Olives' },
          { number: 14, label: 'Passover, Gethsemane and arrest' },
          { number: 15, label: 'Trial, crucifixion and burial' },
          { number: 16, label: 'The empty tomb' },
        ],
      },
      {
        bookCode: 'LUK', bookName: 'Luke', defaultChapter: 19,
        chapters: [
          { number: 19, label: 'The King enters Jerusalem' },
          { number: 20, label: 'Teaching in the Temple' },
          { number: 21, label: 'The widow and the coming days' },
          { number: 22, label: 'The supper, prayer and arrest' },
          { number: 23, label: 'Trial, crucifixion and burial' },
          { number: 24, label: 'The empty tomb' },
        ],
      },
    ],
  },
  events: [
    {
      id: 'entry-gate', label: 'The King Enters Jerusalem', era: 'Arrival and teaching',
      place: 'The eastern approach', hour: 'morning', position: stance(149, 36), lookAt: focus(135, 28, 1.5),
      body: 'Crowds spread cloaks and leafy branches on the road as Jesus entered from the Mount of Olives. Matthew and Mark record the cry of Hosanna; Luke adds that Jesus wept over the city. The exact gate is not named, so this scene uses the eastern approach as an interpretive arrival point.',
      refs: ['Matthew 21:1-11', 'Mark 11:1-11', 'Luke 19:28-44'],
    },
    {
      id: 'temple-cleansing', label: 'My House Shall Be a House of Prayer', era: 'Arrival and teaching',
      place: 'The outer Temple court', hour: 'morning', position: stance(23, -1), lookAt: focus(24, -13),
      body: 'Jesus entered the Temple precinct, drove out those buying and selling, and overturned the money-changers’ tables. The Synoptic accounts place this prophetic action in the final week and connect it with Isaiah’s house of prayer and Jeremiah’s den of robbers.',
      refs: ['Matthew 21:12-17', 'Mark 11:15-19', 'Luke 19:45-48'],
    },
    {
      id: 'temple-teaching', label: 'Teaching in the Temple', era: 'Arrival and teaching',
      place: 'The Temple courts', hour: 'noon', position: stance(37, 2), lookAt: focus(50, -7),
      body: 'During these days Jesus taught openly in the Temple while priests, scribes, elders, Pharisees and Sadducees questioned his authority. Here the scene gathers the public debates around a teacher and attentive crowd without claiming the precise court in which each exchange occurred.',
      refs: ['Matthew 21:23-27', 'Matthew 22:34-40', 'Matthew 23:1-12', 'Mark 11:27-33', 'Mark 12:28-40', 'Luke 20:1-47'],
    },
    {
      id: 'widows-offering', label: 'The Widow’s Two Coins', era: 'Arrival and teaching',
      place: 'The Temple treasury', hour: 'noon', position: stance(53, -2), lookAt: focus(62, -12, 1.05),
      body: 'Jesus watched the wealthy place gifts into the treasury, then saw a poor widow offer two small copper coins. Mark and Luke preserve his judgment that she gave more than all the others because she gave out of poverty, all she had to live on.',
      refs: ['Mark 12:41-44', 'Luke 21:1-4'],
    },
    {
      id: 'last-supper', label: 'The Passover Meal', era: 'Passover night',
      place: 'An upper room', hour: 'dusk', position: stance(-50, 29.2), lookAt: focus(-50, 25, 0.9),
      body: 'In a furnished upper room Jesus reclined with the Twelve for Passover, interpreted the bread and cup around his approaching death, named betrayal at the table and spoke of the kingdom. The traditional district is shown, while the particular house remains unknown.',
      refs: ['Matthew 26:17-30', 'Mark 14:12-26', 'Luke 22:7-38'],
    },
    {
      id: 'gethsemane', label: 'Prayer and Arrest in Gethsemane', era: 'Passover night',
      place: 'An olive grove beyond the Kidron', hour: 'night', position: stance(174, -16), lookAt: focus(174, -23, 0.8),
      body: 'After the meal Jesus crossed toward the Mount of Olives and prayed in a place called Gethsemane while the disciples struggled to stay awake. Judas arrived with an armed crowd, Jesus was arrested, and the disciples fled. The city scene shows the garden just beyond the eastern wall; the dedicated Mount of Olives environment explores the hillside more fully.',
      refs: ['Matthew 26:36-56', 'Mark 14:32-52', 'Luke 22:39-53'],
    },
    {
      id: 'caiaphas-courtyard', label: 'In the High Priest’s Courtyard', era: 'Passover night',
      place: 'The Upper City', hour: 'night', position: stance(-70, 64), lookAt: focus(-70, 56, 1.05),
      body: 'Jesus was taken to the high priest while Peter followed into the courtyard. Near the fire Peter denied knowing him three times. The accounts differ in the sequence of hearings, and the high priest’s residence is not securely located, so this courtyard is deliberately representative.',
      refs: ['Matthew 26:57-75', 'Mark 14:53-72', 'Luke 22:54-71'],
    },
    {
      id: 'before-pilate', label: 'Before Pilate', era: 'Trial and crucifixion',
      place: 'The governor’s headquarters', hour: 'dawn', position: stance(-25, -69), lookAt: focus(-33, -74, 1.2),
      body: 'At daybreak the leaders brought Jesus to the Roman governor. Pilate questioned him, addressed the crowd and finally handed him over to be crucified. The location of the praetorium is disputed; this reconstruction places the hearing near the western palace complex.',
      refs: ['Matthew 27:1-26', 'Mark 15:1-15', 'Luke 23:1-25'],
    },
    {
      id: 'road-to-golgotha', label: 'The Road to Golgotha', era: 'Trial and crucifixion',
      place: 'Beyond the western gate', hour: 'morning', position: stance(-116, -20), lookAt: focus(-132, -28, 1.05),
      body: 'The soldiers led Jesus out to crucify him. Simon of Cyrene was compelled to carry the cross, and Luke records women mourning along the way. The route is a visual bridge from the city to Golgotha rather than a claim about the later Via Dolorosa.',
      refs: ['Matthew 27:27-34', 'Mark 15:16-23', 'Luke 23:26-33'],
    },
    {
      id: 'crucifixion', label: 'At Golgotha', era: 'Trial and crucifixion',
      place: 'Outside the city wall', hour: 'noon', position: stance(-151, -34), lookAt: focus(-166, -39, 3.4),
      body: 'Jesus was crucified between two others outside the city. Darkness came over the land, witnesses watched, and the centurion responded to what had happened. The Gospels name Golgotha, the Place of a Skull, but do not preserve enough topography to settle its exact appearance.',
      refs: ['Matthew 27:35-56', 'Mark 15:24-41', 'Luke 23:33-49'],
    },
    {
      id: 'burial', label: 'Laid in a New Tomb', era: 'Trial and crucifixion',
      place: 'A garden near Golgotha', hour: 'dusk', position: stance(-171, -70), lookAt: focus(-168, -75, 1),
      body: 'Joseph of Arimathea received the body from Pilate, wrapped it and placed it in a rock-cut tomb before the Sabbath. Women who had followed from Galilee saw where he was laid. The scene joins tomb and garden as the narratives do, while leaving their debated modern identification open.',
      refs: ['Matthew 27:57-61', 'Mark 15:42-47', 'Luke 23:50-56'],
    },
    {
      id: 'empty-tomb', label: 'He Is Not Here', era: 'Resurrection morning',
      place: 'The garden tomb', hour: 'dawn', position: stance(-171, -70), lookAt: focus(-171, -76, 0.9),
      body: 'At dawn on the first day of the week women came to the tomb and found the stone moved. Messengers announced that Jesus had risen, and the women carried the news back to the disciples. The tableau focuses on the shared Synoptic witness while respecting their distinct details.',
      refs: ['Matthew 28:1-10', 'Mark 16:1-8', 'Luke 24:1-12'],
    },
  ],
  vantages: [
    { id: 'eastern-gate', label: 'The Eastern Approach', event: 'entry-gate', position: stance(145, 34), lookAt: focus(135, 28, 1.6), blurb: 'The approach from the Mount of Olives enters a city swollen with Passover pilgrims, with the Temple rising beyond the gate.', refs: ['Mark 11:8-11', 'Luke 19:37-44'] },
    { id: 'temple-courts', label: 'The Temple Courts', event: 'temple-teaching', position: stance(49, 3), lookAt: focus(51, -14, 3), blurb: 'The Temple was the public centre of the final week: a place of worship, argument, prophetic action and watchful authority.', refs: ['Mark 11:15-12:44', 'Luke 19:45-21:4'] },
    { id: 'upper-city', label: 'The Upper City', event: 'last-supper', position: stance(-50, 29.2), lookAt: focus(-50, 25, 0.9), blurb: 'Large houses climbed the western hill. The Gospels do not identify the Passover house, but describe a furnished upper room prepared for Jesus and the Twelve.', refs: ['Mark 14:12-17', 'Luke 22:7-14'] },
    { id: 'gethsemane-garden', label: 'Gethsemane', event: 'gethsemane', position: stance(174, -16), lookAt: focus(174, -23, 0.8), blurb: 'Across the Kidron, an olive grove became the place of anguished prayer, sleeping disciples, betrayal and arrest.', refs: ['Matthew 26:36-56', 'Mark 14:32-52', 'Luke 22:39-53'] },
    { id: 'praetorium', label: 'The Praetorium', event: 'before-pilate', position: stance(-25, -69), lookAt: focus(-33, -74, 1.2), blurb: 'The governor heard the case at his Jerusalem headquarters. Its exact location is debated between the palace area and the Antonia complex.', refs: ['Mark 15:1-15', 'Luke 23:1-25'] },
    { id: 'golgotha', label: 'Golgotha', event: 'crucifixion', position: stance(-160, -28), lookAt: focus(-166, -39, 2.5), blurb: 'A place outside the wall, near enough to a road for passers-by and near a garden with a rock-cut tomb.', refs: ['Matthew 27:33-44', 'Mark 15:21-32'] },
    { id: 'garden-tomb', label: 'The Garden Tomb', event: 'empty-tomb', position: stance(-165, -69), lookAt: focus(-171, -76, 0.9), blurb: 'Before Sabbath the tomb was closed; at dawn after it, the women found its stone moved and heard the announcement that Jesus had risen.', refs: ['Matthew 27:57-28:10', 'Mark 15:42-16:8', 'Luke 23:50-24:12'] },
  ],
  hotspots: [
    { id: 'city-gate', label: 'The City Gate', event: 'entry-gate', position: focus(112, 28, 9), maxDistance: 130, body: 'Jerusalem’s eastern approach faced the Kidron Valley and the Mount of Olives. The Gospels name the approach but not a particular gate.', refs: ['Luke 19:37-44'] },
    { id: 'temple', label: 'The Temple', event: ['temple-cleansing', 'temple-teaching'], position: focus(52, -35, 25), maxDistance: 260, body: 'Herod’s sanctuary dominated the city. Here Jesus taught, acted against the commerce in the courts and warned of the judgment to come.', refs: ['Mark 11:15-18', 'Mark 13:1-2'] },
    { id: 'treasury', label: 'The Treasury', event: 'widows-offering', position: focus(63, -13, 2.4), maxDistance: 80, body: 'Offering chests in the Temple precinct received gifts. Jesus sat opposite and noticed a widow whose two small coins escaped everyone else’s attention.', refs: ['Mark 12:41-44', 'Luke 21:1-4'] },
    { id: 'upper-room', label: 'The Upper Room', event: 'last-supper', position: focus(-49, 24, 1.4), maxDistance: 100, body: 'A prepared upstairs guest room held the Passover meal. Scripture gives no address, so its placement in this district is illustrative.', refs: ['Matthew 26:17-30', 'Mark 14:12-26', 'Luke 22:7-38'] },
    { id: 'garden-olives', label: 'The Gethsemane Olives', event: 'gethsemane', position: focus(174, -25, 5.5), maxDistance: 80, body: 'The name Gethsemane suggests an olive press. The grove stood across the Kidron on the lower Mount of Olives, where Jesus often met with his disciples.', refs: ['Matthew 26:36-46', 'Mark 14:32-42', 'Luke 22:39-46'] },
    { id: 'courtyard-fire', label: 'The Courtyard Fire', event: 'caiaphas-courtyard', position: focus(-70, 56, 1.1), maxDistance: 70, body: 'Servants and guards warmed themselves while Peter remained nearby and denied three times that he knew Jesus.', refs: ['Mark 14:54-72', 'Luke 22:54-62'] },
    { id: 'judgment-seat', label: 'The Judgment Seat', event: 'before-pilate', position: focus(-33, -74, 2.2), maxDistance: 90, body: 'Pilate addressed the accusers and, despite declaring no basis for the charge in Luke’s account, handed Jesus over.', refs: ['Matthew 27:11-26', 'Luke 23:13-25'] },
    { id: 'three-crosses', label: 'The Three Crosses', event: 'crucifixion', position: focus(-166, -39, 4), maxDistance: 130, body: 'Jesus was crucified with two others, one on each side. The scene uses the familiar three-cross composition to make that shared narrative geography legible.', refs: ['Mark 15:24-32', 'Luke 23:32-43'] },
    { id: 'rolled-stone', label: 'The Rolled Stone', event: ['burial', 'empty-tomb'], position: focus(-168.7, -75.9, 1.3), maxDistance: 80, body: 'A large stone closed the rock-cut entrance. On the first day of the week the women found it moved and the tomb open.', refs: ['Mark 15:46-16:4', 'Luke 23:53-24:2'] },
  ],
};
