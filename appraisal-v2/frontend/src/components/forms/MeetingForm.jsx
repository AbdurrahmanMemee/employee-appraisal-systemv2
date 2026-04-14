import React from 'react';

const MeetingForm = () => {
    const handleSubmit = (event) => {
        event.preventDefault();
        // Handle form submission logic here
    };

    return (
        <form onSubmit={handleSubmit}>
            <div>
                <label htmlFor="meetingDate">Meeting Date:</label>
                <input type="date" id="meetingDate" name="meetingDate" required />
            </div>
            <div>
                <label htmlFor="meetingTime">Meeting Time:</label>
                <input type="time" id="meetingTime" name="meetingTime" required />
            </div>
            <div>
                <label htmlFor="participants">Participants:</label>
                <input type="text" id="participants" name="participants" required />
            </div>
            <button type="submit">Schedule Meeting</button>
        </form>
    );
};

export default MeetingForm;