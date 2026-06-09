import React, { useState, useEffect } from 'react';
import './Calendar.css';
import { Calendar as CalendarIcon, Clock, MapPin, Check, X, Info, ExternalLink, BookOpen } from 'lucide-react';

export default function Calendar() {
  const [filter, setFilter] = useState('all');
  const [rsvps, setRsvps] = useState({});
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Load RSVPs from LocalStorage on mount
  useEffect(() => {
    const savedRSVPs = localStorage.getItem('miqra_rsvps');
    if (savedRSVPs) {
      try {
        setRsvps(JSON.parse(savedRSVPs));
      } catch (e) {
        console.error("Could not parse saved RSVPs", e);
      }
    }
  }, []);

  const handleRSVP = (eventId) => {
    const updatedRSVPs = {
      ...rsvps,
      [eventId]: !rsvps[eventId]
    };
    setRsvps(updatedRSVPs);
    localStorage.setItem('miqra_rsvps', JSON.stringify(updatedRSVPs));
  };

  const events = [
    {
      id: 1,
      title: "Sunday Morning Youth Service",
      dateStr: "Sunday, June 14, 2026",
      month: "Jun",
      day: "14",
      weekday: "Sunday",
      time: "9:30 AM - 11:00 AM",
      location: "Youth Center / Main Auditorium",
      address: "13 San Miguel Road, Charleston SC",
      category: "sabbath",
      badgeText: "Sunday Service",
      description: "Join us for our main Sunday morning youth service. We will kick off with worship, listen to a message, and break out into our small groups for study and discussion. Don't forget to stay for fellowship and donuts afterward!",
      readings: [
        "Old Testament Focus: Deuteronomy 6:4-9",
        "New Testament Focus: Ephesians 4:1-6",
        "Gospel Reading: Mark 12:28-31"
      ]
    },
    {
      id: 2,
      title: "Wednesday Night Youth Group",
      dateStr: "Wednesday, June 17, 2026",
      month: "Jun",
      day: "17",
      weekday: "Wednesday",
      time: "6:30 PM - 8:00 PM",
      location: "Youth Gym & Cafe",
      address: "13 San Miguel Road, Charleston SC",
      category: "study",
      badgeText: "Bible Study Night",
      description: "Our mid-week youth group night. We gather for games, a short teaching, and small group circles. We are currently walking through our series: 'Lead Like Jesus'. Come hang out and grow together!",
      readings: [
        "Ephesians Chapter 4 Study Guide"
      ]
    },
    {
      id: 3,
      title: "Pentecost Sunday & Youth Picnic",
      dateStr: "Sunday, June 21, 2026",
      month: "Jun",
      day: "21",
      weekday: "Sunday",
      time: "10:30 AM - 3:00 PM",
      location: "James Island County Park (Pavilion A)",
      address: "871 Riverland Dr, Charleston SC",
      category: "feast",
      badgeText: "Special Event",
      description: "A special outdoor combined youth service celebrating Pentecost Sunday. We commemorate the outpouring of the Holy Spirit (Acts 2). Includes worship, outdoor baptisms, games, and a church-wide BBQ picnic. RSVP to secure lunch!",
      readings: [
        "Old Testament: Joel 2:28-32",
        "New Testament Epistle: Acts 2:1-21",
        "Gospel Reading: Luke 24:44-49"
      ]
    },
    {
      id: 4,
      title: "Community Service Outreach",
      dateStr: "Friday, June 26, 2026",
      month: "Jun",
      day: "26",
      weekday: "Friday",
      time: "3:00 PM - 6:00 PM",
      location: "Downtown Charleston Food Bank",
      address: "506 Meeting St, Charleston SC",
      category: "fellowship",
      badgeText: "Outreach",
      description: "Putting our faith into action! We will gather at the local food bank to package meals, assist with sorting donations, and share encouragement with local families.",
      readings: [
        "Scripture Focus: Matthew 25:35-40"
      ]
    }
  ];

  const filteredEvents = filter === 'all' 
    ? events 
    : events.filter(e => e.category === filter);

  return (
    <div className="animate-fade-in">
      <div className="calendar-header-section">
        <h2>Activities & Convocations</h2>
        
        {/* Filters */}
        <div className="calendar-filters">
          <button 
            onClick={() => setFilter('all')} 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          >
            All Events
          </button>
          <button 
            onClick={() => setFilter('sabbath')} 
            className={`filter-btn ${filter === 'sabbath' ? 'active' : ''}`}
          >
            Sunday Services
          </button>
          <button 
            onClick={() => setFilter('feast')} 
            className={`filter-btn ${filter === 'feast' ? 'active' : ''}`}
          >
            Special Events
          </button>
          <button 
            onClick={() => setFilter('study')} 
            className={`filter-btn ${filter === 'study' ? 'active' : ''}`}
          >
            Studies
          </button>
          <button 
            onClick={() => setFilter('fellowship')} 
            className={`filter-btn ${filter === 'fellowship' ? 'active' : ''}`}
          >
            Outreach
          </button>
        </div>
      </div>

      {/* Events List */}
      <div className="events-list">
        {filteredEvents.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            No scheduled events match this filter. Check back later!
          </div>
        ) : (
          filteredEvents.map((event) => {
            const isRSVPed = rsvps[event.id];
            return (
              <div key={event.id} className={`event-card ${event.category}`}>
                {/* Date Widget */}
                <div className="event-date-badge">
                  <span className="event-date-month">{event.month}</span>
                  <span className="event-date-day">{event.day}</span>
                  <span className="event-date-weekday">{event.weekday}</span>
                </div>

                {/* Event Summary Details */}
                <div className="event-details">
                  <div className="event-title-row">
                    <h3>{event.title}</h3>
                    <span className={`badge ${
                      event.category === 'feast' || event.category === 'sabbath' 
                        ? 'badge-gold' 
                        : event.category === 'study' 
                          ? 'badge-info' 
                          : 'badge-success'
                    }`}>
                      {event.badgeText}
                    </span>
                  </div>
                  
                  <div className="event-meta">
                    <div className="event-meta-item">
                      <Clock size={14} style={{ color: 'var(--accent-gold)' }} />
                      <span>{event.time}</span>
                    </div>
                    <div className="event-meta-item">
                      <MapPin size={14} style={{ color: 'var(--accent-gold)' }} />
                      <span>{event.location}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="event-actions">
                  <button 
                    onClick={() => setSelectedEvent(event)} 
                    className="btn-secondary"
                    style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '8px' }}
                  >
                    <Info size={16} />
                    <span>Details</span>
                  </button>
                  <button 
                    onClick={() => handleRSVP(event.id)} 
                    className={isRSVPed ? 'btn-primary' : 'btn-secondary'}
                    style={{ 
                      padding: '0.5rem 1rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.35rem', 
                      borderRadius: '8px',
                      backgroundColor: isRSVPed ? 'var(--success-green)' : '',
                      borderColor: isRSVPed ? 'var(--success-green)' : '',
                      color: isRSVPed ? '#fff' : ''
                    }}
                  >
                    {isRSVPed ? <Check size={16} /> : <CalendarIcon size={16} />}
                    <span>{isRSVPed ? 'RSVP Yes' : 'RSVP'}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Details Modal */}
      {selectedEvent && (
        <div className="modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div 
            className={`modal-content ${
              selectedEvent.category === 'feast' || selectedEvent.category === 'sabbath' 
                ? 'modal-content-gold' 
                : ''
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close-btn" onClick={() => setSelectedEvent(null)}>
              <X size={24} />
            </button>
            
            <span className={`badge ${
              selectedEvent.category === 'feast' || selectedEvent.category === 'sabbath' 
                ? 'badge-gold' 
                : selectedEvent.category === 'study' 
                  ? 'badge-info' 
                  : 'badge-success'
            }`} style={{ marginBottom: '0.75rem' }}>
              {selectedEvent.badgeText}
            </span>
            <h2 className="modal-title">{selectedEvent.title}</h2>
            
            <div className="modal-info-meta">
              <div className="event-meta-item">
                <CalendarIcon size={16} style={{ color: 'var(--accent-gold)' }} />
                <span><strong>Date:</strong> {selectedEvent.dateStr}</span>
              </div>
              <div className="event-meta-item">
                <Clock size={16} style={{ color: 'var(--accent-gold)' }} />
                <span><strong>Time:</strong> {selectedEvent.time}</span>
              </div>
              <div className="event-meta-item" style={{ alignItems: 'flex-start' }}>
                <MapPin size={16} style={{ color: 'var(--accent-gold)', marginTop: '0.2rem' }} />
                <div>
                  <span><strong>Location:</strong> {selectedEvent.location}</span>
                  <br />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selectedEvent.address}</span>
                  <br />
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedEvent.address || selectedEvent.location)}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="map-link"
                  >
                    <ExternalLink size={12} />
                    <span>Open in Maps</span>
                  </a>
                </div>
              </div>
            </div>

            <p className="modal-desc">{selectedEvent.description}</p>

            {selectedEvent.readings && selectedEvent.readings.length > 0 && (
              <div className="modal-section">
                <h4 className="modal-section-title">
                  <BookOpen size={16} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
                  Suggested Scripture Readings
                </h4>
                <ul className="modal-list">
                  {selectedEvent.readings.map((reading, idx) => (
                    <li key={idx} className="modal-list-item">
                      <span className="modal-list-icon">✦</span>
                      <span>{reading}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="modal-section" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: 'none', paddingTop: 0 }}>
              <button 
                onClick={() => setSelectedEvent(null)}
                className="btn-secondary"
                style={{ padding: '0.6rem 1.2rem', borderRadius: '8px' }}
              >
                Close
              </button>
              <button 
                onClick={() => {
                  handleRSVP(selectedEvent.id);
                  // Update current selected event reference so button redraws if we are in it
                }}
                className={rsvps[selectedEvent.id] ? 'btn-primary' : 'btn-secondary'}
                style={{ 
                  padding: '0.6rem 1.2rem', 
                  borderRadius: '8px',
                  backgroundColor: rsvps[selectedEvent.id] ? 'var(--success-green)' : '',
                  borderColor: rsvps[selectedEvent.id] ? 'var(--success-green)' : '',
                  color: rsvps[selectedEvent.id] ? '#fff' : ''
                }}
              >
                {rsvps[selectedEvent.id] ? <Check size={16} style={{ display: 'inline', marginRight: '0.4rem' }} /> : null}
                <span>{rsvps[selectedEvent.id] ? 'Going' : 'RSVP Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
