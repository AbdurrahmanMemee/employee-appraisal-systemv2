// Updating EmployeeForm.jsx to add validation rules for department_id and job_title_id

// Assuming VALIDATION_RULES is an object that needs to be updated
const VALIDATION_RULES = {
    // ...existing rules,
    department_id: [{ required: true }],
    job_title_id: [{ required: true }] // Added missing validation rules
};

// Updating handleSubmit function to ensure fields are always included in the payload
const handleSubmit = (data) => {
    const payload = {
        // ...other fields,
        department_id: data.department_id, // Ensure this field is included
        job_title_id: data.job_title_id // Ensure this field is included
    };
    // Further processing of payload... 
};
