// AppraisalForm.jsx
// Created on 2026-03-25 05:19:04 UTC
// Author: AbdurrahmanMemee
// Description: A component for creating and editing appraisals, 
// including sections for ratings, weights, and status management.

import React, { useState } from 'react';

const AppraisalForm = ({ initialData = {}, onSubmit }) => {
    const [sections, setSections] = useState(initialData.sections || []);
    const [status, setStatus] = useState(initialData.status || 'Pending');
    
    const handleSectionChange = (index, newSection) => {
        const updatedSections = sections.map((section, i) => (i === index ? newSection : section));
        setSections(updatedSections);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ sections, status });
    };

    return (
        <form onSubmit={handleSubmit}>
            {sections.map((section, index) => (
                <div key={index}>
                    <label>{`Section ${index + 1}`}</label>
                    {/* Assuming each section has properties `rating` and `weight` */}
                    <input 
                        type="number" 
                        value={section.rating} 
                        onChange={e => handleSectionChange(index, { ...section, rating: e.target.value })}
                        placeholder="Rating"
                    />
                    <input 
                        type="number" 
                        value={section.weight} 
                        onChange={e => handleSectionChange(index, { ...section, weight: e.target.value })}
                        placeholder="Weight"
                    />
                </div>
            ))}
            <div>
                <label>Status:</label>
                <select value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="Pending">Pending</option>
                    <option value="Completed">Completed</option>
                    <option value="Reviewed">Reviewed</option>
                </select>
            </div>
            <button type="submit">Save Appraisal</button>
        </form>
    );
};

export default AppraisalForm;