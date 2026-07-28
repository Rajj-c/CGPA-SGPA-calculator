
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getGradePoint, getGradeOptions, getRegulationDetails } from '../utils/gradingLogic';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Trash2, Plus, Download, Moon, Sun, Save, Info, Upload, FileDown, AlertTriangle, Loader2, Clipboard, FileText, Sparkles, Pencil, Check } from 'lucide-react';
import Link from 'next/link';
import html2canvas from 'html2canvas';
import { parsePastedGradeText } from '../utils/textGradeParser';

export default function Calculator() {
    const [activeTab, setActiveTab] = useState('sgpa');
    // Dark mode only - removed theme toggle
    const [regulation, setRegulation] = useState('2021');
    const [isSaving, setIsSaving] = useState(false);
    const [showPortfolioLinks, setShowPortfolioLinks] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Grade Card Import State
    const [isUploading, setIsUploading] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [extractedData, setExtractedData] = useState(null);
    const [isDragging, setIsDragging] = useState(false);

    // Paste Grade Text State
    const [showPasteModal, setShowPasteModal] = useState(false);
    const [pastedText, setPastedText] = useState('');
    const [isParsingText, setIsParsingText] = useState(false);
    const [pasteError, setPasteError] = useState('');

    // Data State
    const [studentName, setStudentName] = useState('');
    const [regNo, setRegNo] = useState('');
    const [prevCgpa, setPrevCgpa] = useState('');
    const [prevCredits, setPrevCredits] = useState('');

    const [semesters, setSemesters] = useState([{ id: 1, credits: '', sgpa: '' }]);
    const [courses, setCourses] = useState([{ id: 1, credits: '', grade: 'S', name: '' }]);
    const [courseCountInput, setCourseCountInput] = useState('');
    const [editingSemesterId, setEditingSemesterId] = useState(null);

    // Undo Feature
    const [undoHistory, setUndoHistory] = useState([]);

    // PDF Chart Reference
    const chartRef = useRef(null);

    // Target CGPA Calculator State
    const [targetCgpa, setTargetCgpa] = useState('');
    const [remainingSemesters, setRemainingSemesters] = useState('');
    const [avgCreditsPerSem, setAvgCreditsPerSem] = useState('20');
    const [requiredSgpa, setRequiredSgpa] = useState(null);

    // Results
    const [calculatedSgpa, setCalculatedSgpa] = useState('0.00');
    const [calculatedCgpa, setCalculatedCgpa] = useState('0.00');


    // Load Data
    useEffect(() => {
        const loadData = async () => {
            // Fallback to local
            const savedData = localStorage.getItem('calculatorDataNext');
            if (savedData) {
                const data = JSON.parse(savedData);
                setStudentName(data.studentName || '');
                setRegNo(data.regNo || '');
                setPrevCgpa(data.prevCgpa || '');
                setPrevCredits(data.prevCredits || '');
                if (data.semesters?.length) setSemesters(data.semesters);
                if (data.courses?.length) setCourses(data.courses);
            }
        };

        loadData();

        // Force dark mode
        document.documentElement.classList.add('dark');

        // Check if first-time user
        const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
        if (!hasSeenTutorial) {
            setShowTutorial(true);
            localStorage.setItem('hasSeenTutorial', 'true');
        }

        // Keyboard shortcut for Undo (Cmd/Ctrl + Z)
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                performUndo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Save Data
    useEffect(() => {
        const data = { studentName, regNo, prevCgpa, prevCredits, semesters, courses };
        localStorage.setItem('calculatorDataNext', JSON.stringify(data));
    }, [studentName, regNo, prevCgpa, prevCredits, semesters, courses]);



    // Calculations
    useEffect(() => {
        // SGPA
        let totalPoints = 0;
        let totalCredits = 0;
        courses.forEach(c => {
            const credit = parseFloat(c.credits);
            if (!isNaN(credit) && credit > 0) {
                totalPoints += credit * getGradePoint(c.grade, regulation);
                totalCredits += credit;
            }
        });
        setCalculatedSgpa(totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00');

        // CGPA
        let cgpaPoints = 0;
        let cgpaCredits = 0;

        // Previous Sem data
        const pc = parseFloat(prevCredits);
        const pg = parseFloat(prevCgpa);
        if (!isNaN(pc) && !isNaN(pg)) {
            cgpaPoints += pc * pg;
            cgpaCredits += pc;
        }

        // Current Semesters logic
        semesters.forEach(s => {
            const cred = parseFloat(s.credits);
            const sgpa = parseFloat(s.sgpa);
            if (!isNaN(cred) && !isNaN(sgpa)) {
                cgpaPoints += cred * sgpa;
                cgpaCredits += cred;
            }
        });

        setCalculatedCgpa(cgpaCredits > 0 ? (cgpaPoints / cgpaCredits).toFixed(2) : '0.00');

    }, [courses, semesters, prevCgpa, prevCredits, regulation]);

    // Handlers
    const addCourse = () => setCourses([...courses, { id: Date.now(), credits: '', grade: 'S', name: '' }]);
    const removeCourse = (id) => setCourses(courses.filter(c => c.id !== id));

    const addSemester = () => setSemesters([...semesters, { id: Date.now(), credits: '', sgpa: '' }]);
    const removeSemester = (id) => setSemesters(semesters.filter(c => c.id !== id));

    const handleCourseCountChange = (e) => {
        const count = parseInt(e.target.value);
        setCourseCountInput(e.target.value);
        if (!isNaN(count) && count > 0 && count <= 15) {
            const newCourses = Array.from({ length: count }, (_, i) => ({
                id: Date.now() + i,
                credits: '',
                grade: 'S',
                name: ''
            }));
            setCourses(newCourses);
        }
    };

    const loadSemesterForEdit = (semester) => {
        if (semester.courses) {
            setCourses(semester.courses);
            setEditingSemesterId(semester.id);
            // Optional: Scroll to top
            const element = document.getElementById('sgpa-finder-tab');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            alert("No course data saved for this semester (legacy data).");
        }
    };

    const deleteSemesterFromHistory = (e, id) => {
        e.stopPropagation(); // Prevent triggering loadSemesterForEdit
        if (confirm("Are you sure you want to delete this semester?")) {
            // Save to undo history before deleting
            const deleted = semesters.find(s => s.id === id);
            if (deleted) {
                setUndoHistory([...undoHistory, { type: 'DELETE_SEMESTER', data: deleted, timestamp: Date.now() }].slice(-10)); // Keep last 10 actions
            }

            setSemesters(semesters.filter(s => s.id !== id));
            if (editingSemesterId === id) {
                setEditingSemesterId(null);
                setCourses([{ id: Date.now(), credits: '', grade: 'S', name: '' }]); // Reset if deleting currently edited one
                setCourseCountInput('');
            }
        }
    };

    const saveAndNextSemester = () => {
        let totalPoints = 0;
        let totalCredits = 0;
        courses.forEach(c => {
            const credit = parseFloat(c.credits);
            if (!isNaN(credit) && credit > 0) {
                totalPoints += credit * getGradePoint(c.grade, regulation);
                totalCredits += credit;
            }
        });

        if (totalCredits === 0) {
            alert("Please add at least one course with credits!");
            return;
        }

        const sgpa = (totalPoints / totalCredits).toFixed(2);
        const newSemester = {
            id: editingSemesterId || Date.now(),
            credits: totalCredits,
            sgpa,
            courses: courses
        };

        if (editingSemesterId) {
            // Update existing
            setSemesters(semesters.map(s => s.id === editingSemesterId ? newSemester : s));
            setEditingSemesterId(null);
            // alert("Semester Updated!"); 
        } else {
            // New Entry
            if (semesters.length === 1 && !semesters[0].credits && !semesters[0].sgpa) {
                setSemesters([newSemester]);
            } else {
                setSemesters([...semesters, newSemester]);
            }
        }

        // Reset
        setCourses([{ id: Date.now() + 1, credits: '', grade: 'S', name: '' }]);
        setCourseCountInput('');
    };



    const clearData = () => {
        if (confirm('Clear all data?')) {
            // Save to undo history
            setUndoHistory([...undoHistory, {
                type: 'CLEAR_DATA',
                data: { semesters, courses, studentName, regNo, prevCgpa, prevCredits },
                timestamp: Date.now()
            }].slice(-10));

            localStorage.removeItem('calculatorDataNext');
            window.location.reload();
        }
    };


    const performUndo = () => {
        if (undoHistory.length === 0) {
            alert('Nothing to undo!');
            return;
        }

        const lastAction = undoHistory[undoHistory.length - 1];

        if (lastAction.type === 'DELETE_SEMESTER') {
            // Restore deleted semester
            const restored = lastAction.data;
            setSemesters([...semesters, restored].sort((a, b) => a.id - b.id));
            alert('Semester restored!');
        } else if (lastAction.type === 'CLEAR_DATA') {
            // Restore all data
            const { semesters: s, courses: c, studentName: n, regNo: r, prevCgpa: pc, prevCredits: pcr } = lastAction.data;
            setSemesters(s);
            setCourses(c);
            setStudentName(n);
            setRegNo(r);
            setPrevCgpa(pc);
            setPrevCredits(pcr);
            alert('Data restored!');
        }

        // Remove from history
        setUndoHistory(undoHistory.slice(0, -1));
    };

    const calculateTargetSgpa = () => {
        const target = parseFloat(targetCgpa);
        const remaining = parseInt(remainingSemesters);
        const avgCreds = parseFloat(avgCreditsPerSem);

        if (isNaN(target) || isNaN(remaining) || isNaN(avgCreds) || remaining <= 0 || avgCreds <= 0) {
            alert('Please fill all fields with valid values.');
            return;
        }

        // Calculate current total credits and points
        let currentCredits = parseFloat(prevCredits) || 0;
        let currentPoints = currentCredits * (parseFloat(prevCgpa) || 0);

        semesters.forEach(s => {
            const cred = parseFloat(s.credits);
            const sgpa = parseFloat(s.sgpa);
            if (!isNaN(cred) && !isNaN(sgpa)) {
                currentCredits += cred;
                currentPoints += cred * sgpa;
            }
        });

        // Calculate required total points for target CGPA
        const futureCredits = remaining * avgCreds;
        const totalFutureCredits = currentCredits + futureCredits;
        const requiredTotalPoints = target * totalFutureCredits;
        const requiredFuturePoints = requiredTotalPoints - currentPoints;
        const required = requiredFuturePoints / futureCredits;

        setRequiredSgpa(required.toFixed(2));
    };

    const exportData = () => {
        const data = {
            studentName,
            regNo,
            prevCgpa,
            prevCredits,
            semesters,
            courses,
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CGPA_Data_${regNo || 'Export'}_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Data exported successfully!');
    };

    const importData = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);

                // Validate required fields
                if (!imported.semesters || !imported.courses) {
                    alert('Invalid data file format.');
                    return;
                }

                const confirmMsg = `Import data exported on ${imported.exportDate ? new Date(imported.exportDate).toLocaleString() : 'Unknown date'}?\n\nThis will REPLACE all current data.`;
                if (confirm(confirmMsg)) {
                    setStudentName(imported.studentName || '');
                    setRegNo(imported.regNo || '');
                    setPrevCgpa(imported.prevCgpa || '');
                    setPrevCredits(imported.prevCredits || '');
                    setSemesters(imported.semesters);
                    setCourses(imported.courses);
                    alert('Data imported successfully!');
                }
            } catch (error) {
                alert('Error reading file. Please ensure it is a valid JSON export.');
                console.error(error);
            }
        };
        reader.readAsText(file);
        // Reset file input
        event.target.value = '';
    };

    const cancelImport = () => {
        setShowPreviewModal(false);
        setExtractedData(null);
    };

    const confirmImport = () => {
        if (!extractedData) return;

        // Save current state for undo
        setUndoHistory([...undoHistory, {
            type: 'CLEAR_DATA', // Treating import like a clear + replace
            data: { semesters, courses, studentName, regNo, prevCgpa, prevCredits },
            timestamp: Date.now()
        }].slice(-10));

        setStudentName(extractedData.studentName || studentName);

        if (extractedData.semesters && extractedData.semesters.length > 0) {
            // Import ALL semesters directly into the history list
            setSemesters(extractedData.semesters.map((sem, i) => {
                // Calculate SGPA for each semester using grading logic
                let pts = 0; let creds = 0;
                sem.courses.forEach(c => {
                    pts += c.credits * getGradePoint(c.grade, regulation);
                    creds += c.credits;
                });

                return {
                    id: Date.now() + 100 + i,
                    credits: creds,
                    sgpa: creds > 0 ? (pts / creds).toFixed(2) : 0,
                    courses: sem.courses.map((c, j) => ({
                        id: Date.now() + 200 + (i * 100) + j,
                        code: c.code || '',
                        name: c.name,
                        credits: c.credits,
                        grade: c.grade
                    }))
                };
            }));

            // Reset the active SGPA editor to a blank state
            setCourses([{ id: Date.now(), credits: '', grade: 'S', name: '' }]);
            setEditingSemesterId(null);
            setCourseCountInput('');
        }

        setShowPreviewModal(false);
        setExtractedData(null);
        alert('Data imported from image successfully!');
    };

    const processFiles = async (files) => {
        if (!files || files.length === 0) return;

        // Validate all are images
        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                alert(`"${file.name}" is not a valid image file. Please upload PNG/JPG only.`);
                return;
            }
        }

        setIsUploading(true);

        try {
            const formData = new FormData();
            // Append all files under the same key 'file'
            for (const file of files) {
                formData.append('file', file);
            }

            const response = await fetch('/api/extract-grades', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to parse grade card');
            }

            setExtractedData(result.data);
            setShowPreviewModal(true);

        } catch (error) {
            console.error('Upload Error:', error);
            alert(`Error: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleFileUpload = async (event) => {
        const files = Array.from(event.target.files || []);
        await processFiles(files);
        event.target.value = '';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (isUploading) return;
        const files = Array.from(e.dataTransfer.files || []);
        await processFiles(files);
    };

    const handlePasteFromClipboard = async () => {
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                const clipText = await navigator.clipboard.readText();
                if (clipText) {
                    setPastedText(clipText);
                    setPasteError('');
                }
            } else {
                alert('Clipboard access not available. Please paste text directly into the text box using Ctrl+V or Cmd+V.');
            }
        } catch (err) {
            console.error('Clipboard read error:', err);
            alert('Could not read clipboard automatically. Please paste your text manually into the box.');
        }
    };

    const handleParsePastedText = async () => {
        if (!pastedText || !pastedText.trim()) {
            setPasteError('Please paste your grade card text first.');
            return;
        }

        setIsParsingText(true);
        setPasteError('');

        try {
            // First try Gemini AI API parsing
            const response = await fetch('/api/parse-pasted-grades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: pastedText }),
            });

            const result = await response.json();
            let dataToUse = null;

            if (response.ok && result.data && result.data.semesters && result.data.semesters.length > 0) {
                dataToUse = result.data;
            } else {
                // Fallback to client-side smart parser
                console.log('AI parsing returned no structured semesters or failed. Trying client-side parser fallback.');
                dataToUse = parsePastedGradeText(pastedText);
            }

            if (dataToUse && dataToUse.semesters && dataToUse.semesters.length > 0) {
                setExtractedData(dataToUse);
                setShowPasteModal(false);
                setShowPreviewModal(true);
            } else {
                setPasteError('Could not detect valid course entries in the pasted text. Make sure your text includes course codes, titles, credits, and letter grades.');
            }
        } catch (err) {
            console.error('Error parsing pasted text:', err);
            // Local fallback attempt
            const fallbackData = parsePastedGradeText(pastedText);
            if (fallbackData && fallbackData.semesters && fallbackData.semesters.length > 0) {
                setExtractedData(fallbackData);
                setShowPasteModal(false);
                setShowPreviewModal(true);
            } else {
                setPasteError(`Unable to parse grade card. Error: ${err.message}`);
            }
        } finally {
            setIsParsingText(false);
        }
    };

    const handleExtractedCourseChange = (semIdx, courseIdx, field, value) => {
        const updatedData = { ...extractedData };
        updatedData.semesters = [...updatedData.semesters];
        updatedData.semesters[semIdx] = { ...updatedData.semesters[semIdx] };
        updatedData.semesters[semIdx].courses = [...updatedData.semesters[semIdx].courses];

        if (field === 'credits') {
            updatedData.semesters[semIdx].courses[courseIdx] = {
                ...updatedData.semesters[semIdx].courses[courseIdx],
                credits: value === '' ? '' : parseFloat(value)
            };
        } else {
            updatedData.semesters[semIdx].courses[courseIdx] = {
                ...updatedData.semesters[semIdx].courses[courseIdx],
                [field]: value
            };
        }

        setExtractedData(updatedData);
    };

    const handleExtractedCourseRemove = (semIdx, courseIdx) => {
        const updatedData = { ...extractedData };
        updatedData.semesters = [...updatedData.semesters];
        updatedData.semesters[semIdx] = { ...updatedData.semesters[semIdx] };
        updatedData.semesters[semIdx].courses = updatedData.semesters[semIdx].courses.filter((_, idx) => idx !== courseIdx);

        if (updatedData.semesters[semIdx].courses.length === 0) {
            updatedData.semesters = updatedData.semesters.filter((_, idx) => idx !== semIdx);
        }

        setExtractedData(updatedData);
    };

    const generatePDF = async () => {
        if (!studentName || !regNo) {
            alert("Please enter your Name and Register Number to download the report.");
            return;
        }

        const doc = new jsPDF();
        let yPos = 20;

        // Header
        doc.setFontSize(24);
        doc.setTextColor(37, 99, 235);
        doc.text("KARE Grade Report", 105, yPos, { align: 'center' });

        yPos += 10;
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated on ${new Date().toLocaleDateString()}`, 105, yPos, { align: 'center' });

        yPos += 15;
        doc.setDrawColor(200);
        doc.line(20, yPos, 190, yPos);

        // Student Info
        yPos += 10;
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(`Name: ${studentName}`, 20, yPos);
        doc.text(`Reg No: ${regNo}`, 120, yPos);

        // CGPA Summary Box
        yPos += 15;
        doc.setFillColor(240, 248, 255);
        doc.roundedRect(20, yPos, 170, 25, 3, 3, 'F');
        yPos += 8;
        doc.setFontSize(14);
        doc.setTextColor(37, 99, 235);
        doc.text(`Current CGPA: ${calculatedCgpa}`, 105, yPos, { align: 'center' });
        yPos += 8;
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);

        // Calculate stats
        const validSems = semesters.filter(s => s.credits && s.sgpa);
        const totalCredits = validSems.reduce((sum, s) => sum + parseFloat(s.credits), 0);
        const avgSgpa = validSems.length > 0
            ? (validSems.reduce((sum, s) => sum + parseFloat(s.sgpa), 0) / validSems.length).toFixed(2)
            : '0.00';

        doc.text(`Total Semesters: ${validSems.length} | Total Credits: ${totalCredits} | Avg SGPA: ${avgSgpa}`, 105, yPos, { align: 'center' });

        yPos += 15;

        // Capture Chart as Image and Add to PDF
        if (chartRef.current && chartData.length > 0) {
            try {
                // Find the original width to render the chart neatly
                const canvas = await html2canvas(chartRef.current, {
                    scale: 2, // High resolution
                    backgroundColor: '#0b131f' // Explicit dark background
                });
                const imgData = canvas.toDataURL('image/png');

                // Calculate maintaining aspect ratio 
                // PDF page width is 210mm. If margins are 20mm each side, available width is 170mm
                const pdfWidth = 170;
                const imgProps = doc.getImageProperties(imgData);
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                doc.addImage(imgData, 'PNG', 20, yPos, pdfWidth, pdfHeight);
                yPos += pdfHeight + 15; // Move cursor down below the image
            } catch (error) {
                console.error("Error generating chart image for PDF:", error);
                // Fallback: Continue without chart if it fails
            }
        }

        // Check if we need a new page before starting the summary table
        if (yPos > 240) {
            doc.addPage();
            yPos = 20;
        }

        // Semester Summary Table
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text("Semester-wise Summary", 20, yPos);
        yPos += 5;

        const semesterData = semesters
            .map((s, i) => (s.credits || s.sgpa) ? [
                `Semester ${i + 1}`,
                s.credits || '-',
                s.sgpa || '-'
            ] : null)
            .filter(Boolean);

        autoTable(doc, {
            startY: yPos,
            head: [['Semester', 'Credits', 'SGPA']],
            body: semesterData,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235] },
            margin: { left: 20, right: 20 }
        });

        yPos = doc.lastAutoTable.finalY + 15;

        // Course-wise Breakdown
        semesters.forEach((sem, semIndex) => {
            if (sem.courses && sem.courses.length > 0 && (sem.credits || sem.sgpa)) {
                // Check if we need a new page
                if (yPos > 250) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFontSize(11);
                doc.setTextColor(0, 0, 0);
                doc.text(`Semester ${semIndex + 1} - Course Details (SGPA: ${sem.sgpa})`, 20, yPos);
                yPos += 5;

                const courseData = sem.courses.map((course, i) => [
                    i + 1,
                    course.name || '-',
                    course.credits || '-',
                    course.grade || '-'
                ]);

                autoTable(doc, {
                    startY: yPos,
                    head: [['#', 'Course Name', 'Credits', 'Grade']],
                    body: courseData,
                    theme: 'striped',
                    headStyles: { fillColor: [147, 51, 234] },
                    margin: { left: 20, right: 20 },
                    styles: { fontSize: 9 }
                });

                yPos = doc.lastAutoTable.finalY + 10;
            }
        });

        // Footer on last page
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            // 1. Branding (Center)
            doc.font = "helvetica";
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Page ${i} of ${pageCount}`, 105, 282, { align: 'center' });
            doc.text("Generated by Raj's KARE CGPA Calculator", 105, 287, { align: 'center' });

            // 2. Portfolio Link (Right Bottom)
            doc.setTextColor(0, 102, 204); // Blue link
            doc.setFontSize(8);
            const linkText = "rajeswar.tech";
            // Align right at x=200
            doc.text(linkText, 200, 287, { align: 'right' });

            // Add clickable link area
            const linkWidth = doc.getTextWidth(linkText);
            // x = 200 - width (since right aligned)
            doc.link(200 - linkWidth, 287 - 3, linkWidth, 4, { url: 'https://rajeswar.tech' });
        }

        doc.save(`Grade_Report_${regNo}_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`);
    };

    // Chart Data Preparation
    const chartData = [
        { name: 'Start', sgpa: parseFloat(prevCgpa) || 0 },
        ...semesters.map((s, i) => ({
            name: `Sem ${i + 1}`,
            sgpa: parseFloat(s.sgpa) || 0
        }))
    ].filter(d => d.sgpa > 0);

    return (
        <div className="min-h-screen p-4 sm:p-8 transition-colors duration-300 font-sans relative overflow-hidden bg-slate-900 text-white">



            {/* Header */}
            <div className="max-w-3xl mx-auto text-center mb-12 relative animate-in fade-in slide-in-from-top-4 duration-700">
                <div className="absolute top-0 right-0">
                    <button
                        onClick={() => setShowTutorial(true)}
                        className="p-3 rounded-full bg-white/20 backdrop-blur border border-white/30 hover:scale-110 transition shadow-sm"
                        title="Show Tutorial"
                    >
                        <Info size={20} />
                    </button>
                </div>

                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-900/30 text-blue-400 mb-6 shadow-inner">
                    <Info size={32} strokeWidth={2.5} />
                </div>

                <h1 className="text-4xl md:text-5xl font-black mb-2 tracking-tight text-white">
                    KARE CGPA & SGPA Calculator
                </h1>

                <p className="text-lg font-medium text-slate-600 dark:text-gray-300 mb-8 relative">
                    - Visit my website: <button onClick={() => setShowPortfolioLinks(!showPortfolioLinks)} className="text-blue-600 dark:text-blue-300 hover:underline font-bold ml-1">rajeswar.tech</button>

                    {showPortfolioLinks && (
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-80 p-4 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 text-left animate-in fade-in zoom-in duration-200">
                            <div className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-3 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg leading-snug">
                                ⚠️ Our college wifi may block newly registered domains. If the main site fails, use the Vercel link.
                            </div>
                            <div className="flex flex-col gap-2">
                                <a href="https://rajeswar.tech" target="_blank" rel="noopener noreferrer" className="block text-center w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition">
                                    Visit rajeswar.tech 🚀
                                </a>
                                <a href="https://rajeswar-tech.vercel.app" target="_blank" rel="noopener noreferrer" className="block text-center w-full py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-lg font-bold text-sm transition border border-gray-200 dark:border-gray-600">
                                    Use rajeswar-tech.vercel.app 🌐
                                </a>
                            </div>
                            <button onClick={() => setShowPortfolioLinks(false)} className="absolute -top-2 -right-2 bg-gray-200 dark:bg-slate-600 text-gray-500 w-6 h-6 rounded-full flex items-center justify-center text-xs hover:bg-red-500 hover:text-white transition">✕</button>
                        </div>
                    )}
                </p>

                <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mb-8">
                    <button
                        onClick={() => setActiveTab('sgpa')}
                        className={`px-4 py-2 sm:px-8 sm:py-3 rounded-xl font-bold text-sm sm:text-lg shadow-lg transition-transform hover:scale-105 active:scale-95 ${activeTab === 'sgpa'
                            ? 'bg-purple-600 text-white ring-4 ring-purple-600/20'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-gray-50'
                            }`}
                    >
                        SGPA Finder
                    </button>
                    <button
                        onClick={() => setActiveTab('cgpa')}
                        className={`px-4 py-2 sm:px-8 sm:py-3 rounded-xl font-bold text-sm sm:text-lg shadow-lg transition-transform hover:scale-105 active:scale-95 ${activeTab === 'cgpa'
                            ? 'bg-blue-500 text-white ring-4 ring-blue-500/20'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-gray-50'
                            }`}
                    >
                        CGPA Calculator
                    </button>
                    <button
                        onClick={() => setActiveTab('target')}
                        className={`px-4 py-2 sm:px-8 sm:py-3 rounded-xl font-bold text-sm sm:text-lg shadow-lg transition-transform hover:scale-105 active:scale-95 ${activeTab === 'target'
                            ? 'bg-green-600 text-white ring-4 ring-green-600/20'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-gray-50'
                            }`}
                    >
                        Target Calculator
                    </button>
                </div>


                <div className="max-w-2xl mx-auto space-y-4 text-sm leading-relaxed text-slate-700 dark:text-gray-300">
                    <p>
                        Note: If you're unsure about your semester-wise SGPA or credits, please visit your <a href="https://sis.kalasalingam.ac.in/grade" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">SIS Login</a> and refer to your transcript to enter the correct number of credits earned in each semester.
                    </p>
                    <p>
                        <span className="font-bold text-red-500 dark:text-red-400">Important:</span> As our university follows a Relative Grading policy, these are just approximate and predicted results, as the official SGPA will be calculated based on the class or slot average of the respective course.
                    </p>
                </div>
            </div>

            <div className="max-w-4xl mx-auto flex flex-col-reverse lg:grid lg:grid-cols-3 gap-8">

                {/* Sidebar: Profile & Stats */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="backdrop-blur-md bg-white/30 border border-white/20 shadow-lg p-6 rounded-2xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-lg border border-white/30 shadow-xl">

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider opacity-70">Student Name</label>
                                <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} className="w-full mt-1 p-2 rounded-lg bg-white/50 dark:bg-slate-700/50 border border-white/30 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="RAJ" />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider opacity-70">Reg No</label>
                                <input type="text" value={regNo} onChange={(e) => setRegNo(e.target.value)} className="w-full mt-1 p-2 rounded-lg bg-white/50 dark:bg-slate-700/50 border border-white/30 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="992xxxxxxxx" />
                            </div>

                            {/* Import Grade Card Buttons */}
                            <div className="pt-2 space-y-2">
                                <label
                                    className={`relative flex flex-col items-center justify-center w-full py-4 border-2 border-dashed rounded-xl cursor-pointer transition shadow-sm overflow-hidden group ${isDragging
                                        ? 'border-blue-500 bg-blue-100/80 dark:bg-blue-800/40 scale-[1.02]'
                                        : 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                                        }`}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                >
                                    {isUploading ? (
                                        <div className="flex flex-col items-center">
                                            <Loader2 className="animate-spin text-blue-600 dark:text-blue-400 mb-2" size={24} />
                                            <span className="text-sm font-bold text-blue-800 dark:text-blue-300">Processing with Gemini AI...</span>
                                        </div>
                                    ) : isDragging ? (
                                        <div className="flex flex-col items-center">
                                            <div className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center mb-2 animate-bounce">
                                                <Upload size={20} />
                                            </div>
                                            <span className="text-sm font-bold text-blue-700 dark:text-blue-200">Drop to upload!</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center">
                                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                                <Upload size={20} />
                                            </div>
                                            <span className="text-sm font-bold text-blue-800 dark:text-blue-300">Auto-Fill: Upload Grade Card</span>
                                            <span className="text-xs opacity-60 text-center mt-1 px-4">Drag & drop or click to upload (PNG/JPG)</span>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" multiple onChange={handleFileUpload} disabled={isUploading} className="hidden" />
                                </label>

                                <button
                                    type="button"
                                    onClick={() => setShowPasteModal(true)}
                                    className="w-full py-2.5 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-bold text-xs flex items-center justify-center gap-2 transition shadow-sm"
                                >
                                    <Clipboard size={16} />
                                    📋 Copy & Paste Grade Card Text
                                </button>
                            </div>
                        </div>

                        <div className="text-center p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl border border-blue-500/20">
                            <div className="text-xs font-bold uppercase opacity-60">Current CGPA</div>
                            <div key="cgpa-display" className="text-5xl font-black text-blue-600 dark:text-blue-400 my-2 animate-in zoom-in duration-300">{calculatedCgpa}</div>
                            <div className="text-xs font-bold uppercase opacity-60">SGPA via Courses</div>
                            <div key="sgpa-display" className="text-2xl font-bold text-purple-600 dark:text-purple-400 animate-in zoom-in duration-300">{calculatedSgpa}</div>
                        </div>

                        {/* Statistics Dashboard */}
                        {semesters.some(s => s.credits || s.sgpa) && (() => {
                            const validSems = semesters.filter(s => s.credits && s.sgpa);
                            const totalSems = validSems.length;
                            const totalCredits = validSems.reduce((sum, s) => sum + parseFloat(s.credits), 0);
                            const avgSgpa = validSems.length > 0
                                ? (validSems.reduce((sum, s) => sum + parseFloat(s.sgpa), 0) / validSems.length).toFixed(2)
                                : '0.00';
                            const best = validSems.length > 0
                                ? Math.max(...validSems.map(s => parseFloat(s.sgpa))).toFixed(2)
                                : '0.00';
                            const worst = validSems.length > 0
                                ? Math.min(...validSems.map(s => parseFloat(s.sgpa))).toFixed(2)
                                : '0.00';

                            // Trend calculation
                            let trend = '→';
                            if (validSems.length >= 2) {
                                const recent = parseFloat(validSems[validSems.length - 1].sgpa);
                                const prev = parseFloat(validSems[validSems.length - 2].sgpa);
                                trend = recent > prev ? '↗' : recent < prev ? '↘' : '→';
                            }

                            return (
                                <div className="mt-4 p-4 rounded-xl bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-700/30">
                                    <h4 className="font-bold text-sm mb-3 text-purple-800 dark:text-purple-300 flex items-center gap-2">
                                        📊 Statistics
                                    </h4>
                                    <div className="space-y-2 text-xs">
                                        <div className="flex justify-between">
                                            <span className="opacity-70">Total Semesters:</span>
                                            <span className="font-bold">{totalSems}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="opacity-70">Total Credits:</span>
                                            <span className="font-bold">{totalCredits}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="opacity-70">Average SGPA:</span>
                                            <span className="font-bold text-purple-600 dark:text-purple-400">{avgSgpa}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="opacity-70">Best Semester:</span>
                                            <span className="font-bold text-green-600 dark:text-green-400">{best}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="opacity-70">Lowest Semester:</span>
                                            <span className="font-bold text-orange-600 dark:text-orange-400">{worst}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-2 border-t border-purple-200 dark:border-purple-700/30">
                                            <span className="opacity-70">Trend:</span>
                                            <span className="font-bold text-lg">{trend} {trend === '↗' ? 'Improving' : trend === '↘' ? 'Declining' : 'Stable'}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="mt-6 p-4 rounded-xl bg-orange-50/50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-700/30 text-xs text-orange-800 dark:text-orange-200 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-orange-400"></div>
                            <h4 className="font-bold mb-1 flex items-center gap-2">
                                <span className="text-lg">⚠️</span> Regulation Notice
                            </h4>
                            <p className="opacity-90 leading-relaxed mb-3">
                                Calculated SGPA may slightly differ from the official CGPA as the <strong>2025 Regulations</strong> are updated (A=8 vs A=9). This calculator currently follows <strong>2021 Regulations</strong>.
                            </p>
                            <a href="/KARE_B.-Tech.-Academic-Regulations-2021.pdf" download className="flex items-center gap-2 text-orange-700 dark:text-orange-300 font-bold hover:underline mb-1">
                                <Download size={14} /> Download 2021 Regulations
                            </a>
                            <a href="/R2025.pdf" download className="flex items-center gap-2 text-orange-700 dark:text-orange-300 font-bold hover:underline">
                                <Download size={14} /> Download 2025 Regulations
                            </a>
                        </div>

                        {/* Grading Table */}
                        <div className="mt-6 p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
                            <h4 className="font-bold text-sm mb-2 text-blue-800 dark:text-blue-300">Grade Points Difference</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead>
                                        <tr className="border-b border-blue-200 dark:border-blue-700">
                                            <th className="py-1 min-w-[40px] text-gray-700 dark:text-gray-200">Grade</th>
                                            <th className="py-1 text-gray-700 dark:text-gray-200">2021 Pts</th>
                                            <th className="py-1 text-gray-700 dark:text-gray-200">2025 Pts</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            { g: 'S', p1: 10, p2: 10 },
                                            { g: 'A', p1: 9, p2: 8 },
                                            { g: 'B', p1: 8, p2: 7 },
                                            { g: 'C', p1: 7, p2: 6 },
                                            { g: 'D', p1: 6, p2: 5 },
                                            { g: 'E', p1: 5, p2: 4 },
                                            { g: 'U', p1: 0, p2: 0 },
                                        ].map((row) => (
                                            <tr key={row.g} className="border-b border-blue-100 dark:border-blue-800/50 last:border-0 hover:bg-blue-100/50 dark:hover:bg-blue-800/30 transition">
                                                <td className="py-1 font-bold text-gray-800 dark:text-gray-100">{row.g}</td>
                                                <td className="py-1 font-bold text-blue-600 dark:text-blue-400">{row.p1}</td>
                                                <td className="py-1 text-purple-600 dark:text-purple-400">{row.p2}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="mt-6 flex flex-col gap-3">
                            <button onClick={generatePDF} className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg transition transform hover:scale-105">
                                <Download size={18} /> Download Report
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={exportData} className="flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold transition">
                                    <FileDown size={16} /> Export
                                </button>
                                <label className="flex items-center justify-center gap-2 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold transition cursor-pointer">
                                    <Upload size={16} /> Import
                                    <input type="file" accept=".json" onChange={importData} className="hidden" />
                                </label>
                            </div>

                            <button
                                onClick={performUndo}
                                disabled={undoHistory.length === 0}
                                className={`flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-bold transition ${undoHistory.length > 0 ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-gray-300 dark:bg-slate-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'}`}
                                title="Undo last action (Ctrl/Cmd + Z)"
                            >
                                ↶ Undo {undoHistory.length > 0 && `(${undoHistory.length})`}
                            </button>

                            <button onClick={clearData} className="flex items-center justify-center gap-2 w-full py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-xl text-sm font-semibold transition">
                                <Trash2 size={16} /> Clear Data
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="lg:col-span-2 flex flex-col gap-6">

                    {/* Calculator Tabs */}
                    <div id="sgpa-calculator-form" className="backdrop-blur-md bg-white/30 border border-white/20 shadow-lg p-6 rounded-2xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-lg border border-white/30 shadow-xl scroll-mt-6">


                        {activeTab === 'sgpa' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 bg-purple-50 dark:bg-purple-900/10 p-3 rounded-xl border border-purple-100 dark:border-purple-800/30 gap-3 sm:gap-0">
                                    <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                                        <label className="text-xs font-bold uppercase opacity-60">Set No. of Courses:</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="15"
                                            value={courseCountInput}
                                            onChange={handleCourseCountChange}
                                            className="w-16 p-1 text-center rounded-lg bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-700 focus:ring-2 focus:ring-purple-400 outline-none font-bold"
                                            placeholder="#"
                                        />
                                    </div>
                                    <button onClick={addCourse} className="w-full sm:w-auto text-xs bg-purple-600 text-white px-3 py-2 sm:py-1.5 rounded-full font-bold hover:bg-purple-700 transition shadow-sm">+ Add Single</button>
                                </div>
                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {courses.length === 0 ? (
                                        <div className="text-center p-8 opacity-50 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
                                            <div className="text-4xl mb-2">✨</div>
                                            <p className="font-bold">No courses yet!</p>
                                            <p className="text-xs">Add a course to start calculating your SGPA.</p>
                                        </div>
                                    ) : (
                                        courses.map((course, index) => (
                                            <div key={course.id} className="group flex flex-col gap-2 bg-white/60 dark:bg-slate-700/60 p-3 rounded-xl border border-white/20 shadow-sm hover:shadow-md hover:bg-white/80 dark:hover:bg-slate-700/80 transition-all duration-200">
                                                <div className="flex gap-3 items-center">
                                                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 text-xs font-bold group-hover:scale-110 transition">{index + 1}</div>
                                                    <div className="flex-1">
                                                        <input
                                                            type="text"
                                                            value={course.name || ''}
                                                            onChange={(e) => {
                                                                const newCourses = [...courses];
                                                                newCourses[index].name = e.target.value;
                                                                setCourses(newCourses);
                                                            }}
                                                            className="w-full p-1.5 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-white/20 text-xs focus:ring-2 focus:ring-purple-400 outline-none transition font-medium"
                                                            placeholder="Course Name (e.g., CSE3001 - Software Engineering)"
                                                        />
                                                    </div>
                                                    <button onClick={() => removeCourse(course.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"><Trash2 size={16} /></button>
                                                </div>
                                                <div className="flex gap-3 ml-11">
                                                    <div className="flex-1">
                                                        <label className="text-[10px] font-bold uppercase opacity-50 block mb-1">Credits</label>
                                                        <input type="number" value={course.credits} onChange={(e) => {
                                                            const newCourses = [...courses];
                                                            newCourses[index].credits = e.target.value;
                                                            setCourses(newCourses);
                                                        }} className="w-full p-2 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-white/20 text-sm focus:ring-2 focus:ring-blue-400 outline-none transition" placeholder="Cred" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="text-[10px] font-bold uppercase opacity-50 block mb-1">Grade</label>
                                                        <select value={course.grade} onChange={(e) => {
                                                            const newCourses = [...courses];
                                                            newCourses[index].grade = e.target.value;
                                                            setCourses(newCourses);
                                                        }} className="w-full p-2 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-white/20 text-sm focus:ring-2 focus:ring-blue-400 outline-none appearance-none transition cursor-pointer hover:bg-white/80 dark:hover:bg-slate-800">
                                                            {getGradeOptions().map(g => <option key={g} value={g}>{g}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="mt-4 pt-4 border-t border-white/20">
                                    <button
                                        onClick={saveAndNextSemester}
                                        className={`w-full py-3 bg-gradient-to-r ${editingSemesterId ? 'from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600' : 'from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'} text-white rounded-xl font-bold shadow-lg transform transition active:scale-95 flex items-center justify-center gap-2`}
                                    >
                                        <Save size={18} /> {editingSemesterId ? 'Update Semester' : 'Save & Start Next Semester'}
                                    </button>
                                </div>

                                {/* Import Grade Card Options */}
                                <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="relative">
                                            <input
                                                type="file"
                                                id="gradeCardUpload"
                                                accept="image/png,image/jpeg,image/jpg,application/pdf"
                                                onChange={handleFileUpload}
                                                className="hidden"
                                                disabled={isUploading}
                                                multiple
                                            />
                                            <label
                                                htmlFor="gradeCardUpload"
                                                className={`flex items-center justify-center gap-2 p-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${isUploading
                                                    ? 'bg-gray-400 cursor-not-allowed'
                                                    : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
                                                    }`}
                                            >
                                                <Upload size={16} />
                                                {isUploading ? 'Processing...' : '📄 Upload Screenshot / PDF'}
                                            </label>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setShowPasteModal(true)}
                                            className="flex items-center justify-center gap-2 p-3 rounded-xl font-bold text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 transition-all cursor-pointer"
                                        >
                                            <Clipboard size={16} />
                                            📋 Paste Grade Card Text
                                        </button>
                                    </div>
                                    <p className="text-xs text-center opacity-60">
                                        Upload grade card screenshots/PDF <strong>OR</strong> paste copied text to auto-organize & calculate!
                                    </p>
                                </div>

                                {/* Semester History in SGPA Tab */}
                                {semesters.some(s => s.credits || s.sgpa) && (
                                    <div className="mt-6">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-sm font-bold text-purple-800 dark:text-purple-300">📚 Saved Semesters History</h4>
                                            {semesters.filter(s => s.credits || s.sgpa).length > 3 && (
                                                <input
                                                    type="text"
                                                    placeholder="Search..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="px-3 py-1 text-xs rounded-lg bg-white/50 dark:bg-slate-800/50 border border-purple-200 dark:border-purple-700 focus:ring-2 focus:ring-purple-400 outline-none w-32"
                                                />
                                            )}
                                        </div>
                                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                            {semesters.map((sem, idx) => sem.courses && (sem.credits || sem.sgpa) && (
                                                // Filter logic
                                                (!searchQuery ||
                                                    `Semester ${idx + 1}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                    sem.sgpa?.includes(searchQuery) ||
                                                    sem.credits?.includes(searchQuery) ||
                                                    sem.courses?.some(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase()))
                                                ) ? (
                                                    <div
                                                        key={sem.id}
                                                        onClick={() => loadSemesterForEdit(sem)}
                                                        className={`flex justify-between items-center p-3 rounded-lg text-sm shadow-sm transition cursor-pointer border ${editingSemesterId === sem.id ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700' : 'bg-white/50 dark:bg-slate-700/50 border-white/10 hover:bg-white/60 dark:hover:bg-slate-700/60'}`}
                                                    >
                                                        <span className="font-bold text-slate-700 dark:text-slate-300">Semester {idx + 1} {editingSemesterId === sem.id && <span className="text-[10px] text-orange-600 bg-orange-100 px-1 rounded ml-2">EDITING</span>}</span>
                                                        <div className="flex gap-4 items-center">
                                                            <span className="text-slate-500 dark:text-slate-400">Cr: <strong className="text-slate-800 dark:text-slate-200">{sem.credits}</strong></span>
                                                            <span className="text-slate-500 dark:text-slate-400">SGPA: <strong className="text-blue-600 dark:text-blue-400">{sem.sgpa}</strong></span>
                                                            <button
                                                                onClick={(e) => deleteSemesterFromHistory(e, sem.id)}
                                                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : null))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'cgpa' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="grid grid-cols-2 gap-4 mb-4 p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
                                    <div>
                                        <label className="text-xs font-bold uppercase opacity-60 block mb-1">Prev CGPA</label>
                                        <input type="number" value={prevCgpa} onChange={(e) => setPrevCgpa(e.target.value)} className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-white/20 focus:ring-1 focus:ring-blue-400 outline-none" placeholder="0.00" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase opacity-60 block mb-1">Prev Credits</label>
                                        <input type="number" value={prevCredits} onChange={(e) => setPrevCredits(e.target.value)} className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-white/20 focus:ring-1 focus:ring-blue-400 outline-none" placeholder="0" />
                                    </div>
                                </div>

                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-bold">Semesters</h3>
                                    <button onClick={addSemester} className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-3 py-1 rounded-full font-bold hover:bg-blue-200 transition">+ Add Semester</button>
                                </div>

                                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                    {semesters.length === 0 ? (
                                        <div className="text-center p-8 opacity-50 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
                                            <div className="text-4xl mb-2">📊</div>
                                            <p className="font-bold">No semesters added.</p>
                                            <p className="text-xs">Add a semester to track your CGPA trend.</p>
                                        </div>
                                    ) : (
                                        semesters.map((sem, index) => (
                                            <div key={sem.id} className="group flex gap-3 items-center bg-white/60 dark:bg-slate-700/60 p-3 rounded-xl border border-white/20 shadow-sm hover:shadow-md hover:bg-white/80 dark:hover:bg-slate-700/80 transition-all duration-200">
                                                <div className="w-8 h-8 flex items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-600 text-xs font-bold group-hover:scale-110 transition">{index + 1}</div>
                                                <div className="flex-1 grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase opacity-50 block mb-1">Credits</label>
                                                        <input type="number" value={sem.credits} onChange={(e) => {
                                                            const newSem = [...semesters];
                                                            newSem[index].credits = e.target.value;
                                                            setSemesters(newSem);
                                                        }} className="w-full p-2 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-white/20 text-sm focus:ring-2 focus:ring-blue-400 outline-none transition" placeholder="Credits" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase opacity-50 block mb-1">SGPA</label>
                                                        <input type="number" value={sem.sgpa} onChange={(e) => {
                                                            const newSem = [...semesters];
                                                            newSem[index].sgpa = e.target.value;
                                                            setSemesters(newSem);
                                                        }} className="w-full p-2 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-white/20 text-sm focus:ring-2 focus:ring-blue-400 outline-none transition" step="0.01" placeholder="SGPA" />
                                                    </div>
                                                </div>
                                                <button onClick={() => removeSemester(sem.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"><Trash2 size={16} /></button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'target' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-200 dark:border-green-800/30 mb-4">
                                    <h3 className="font-bold text-green-800 dark:text-green-300 mb-2 flex items-center gap-2">
                                        🎯 Target CGPA Planning Tool
                                    </h3>
                                    <p className="text-sm text-green-700 dark:text-green-400 opacity-90">
                                        Calculate what SGPA you need in upcoming semesters to achieve your target CGPA.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold uppercase opacity-60 block mb-1">Your Target CGPA</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={targetCgpa}
                                            onChange={(e) => setTargetCgpa(e.target.value)}
                                            className="w-full p-3 rounded-lg bg-white dark:bg-slate-800 border border-green-200 dark:border-green-700 focus:ring-2 focus:ring-green-400 outline-none text-lg font-bold"
                                            placeholder="8.50"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold uppercase opacity-60 block mb-1">Remaining Semesters</label>
                                            <input
                                                type="number"
                                                value={remainingSemesters}
                                                onChange={(e) => setRemainingSemesters(e.target.value)}
                                                className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-white/20 focus:ring-2 focus:ring-green-400 outline-none"
                                                placeholder="2"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold uppercase opacity-60 block mb-1">Avg Credits/Sem</label>
                                            <input
                                                type="number"
                                                value={avgCreditsPerSem}
                                                onChange={(e) => setAvgCreditsPerSem(e.target.value)}
                                                className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-white/20 focus:ring-2 focus:ring-green-400 outline-none"
                                                placeholder="20"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        onClick={calculateTargetSgpa}
                                        className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-bold shadow-lg transform transition active:scale-95"
                                    >
                                        Calculate Required SGPA
                                    </button>

                                    {requiredSgpa !== null && (
                                        <div className="mt-6 p-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl border border-green-500/30 animate-in fade-in zoom-in duration-300">
                                            <div className="text-center">
                                                <div className="text-xs font-bold uppercase opacity-60 mb-2">Required SGPA Per Semester</div>
                                                <div className="text-5xl font-black text-green-600 dark:text-green-400 mb-4">{requiredSgpa}</div>

                                                {parseFloat(requiredSgpa) > 10 ? (
                                                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                                                        <p className="text-sm font-bold text-red-700 dark:text-red-400">
                                                            ⚠️ Target is NOT achievable! Maximum SGPA is 10.00
                                                        </p>
                                                        <p className="text-xs text-red-600 dark:text-red-500 mt-1">
                                                            Consider adjusting your target CGPA or increasing remaining semesters.
                                                        </p>
                                                    </div>
                                                ) : parseFloat(requiredSgpa) >= 9.5 ? (
                                                    <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
                                                        <p className="text-sm font-bold text-orange-700 dark:text-orange-400">
                                                            ⚡ Very challenging! You'll need nearly all S grades.
                                                        </p>
                                                    </div>
                                                ) : parseFloat(requiredSgpa) >= 8.5 ? (
                                                    <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                                                        <p className="text-sm font-bold text-green-700 dark:text-green-400">
                                                            ✅ Achievable with focus! Mix of S and A grades needed.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                                                        <p className="text-sm font-bold text-blue-700 dark:text-blue-400">
                                                            😊 Very achievable! B+ grades or better will get you there.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Chart */}
                    <div className="bg-[#0b131f] border border-gray-800 shadow-2xl p-6 rounded-2xl overflow-hidden relative">
                        {/* Background radial glow */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(circle,rgba(6,182,212,0.05)_0%,transparent_70%)] pointer-events-none"></div>

                        <h3 className="text-gray-200 text-lg font-medium mb-6 relative z-10">Performance Trend</h3>
                        <div className="h-64 w-full relative z-10" ref={chartRef}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorCyan" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.6} />
                                            <stop offset="80%" stopColor="#06b6d4" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#1e293b" opacity={0.6} />
                                    <XAxis
                                        dataKey="name"
                                        stroke="#64748b"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={{ stroke: '#06b6d4', strokeWidth: 1 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        stroke="#64748b"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={{ stroke: '#06b6d4', strokeWidth: 1 }}
                                        domain={[0, 10]}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', color: '#fff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                                        cursor={{ stroke: '#06b6d4', strokeWidth: 1, strokeDasharray: '4 4' }}
                                        itemStyle={{ color: '#06b6d4', fontWeight: 'bold' }}
                                    />
                                    <Area
                                        type="linear"
                                        dataKey="sgpa"
                                        stroke="#06b6d4"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorCyan)"
                                        activeDot={{ r: 6, fill: '#06b6d4', stroke: '#0b131f', strokeWidth: 2 }}
                                        dot={{ r: 4, fill: '#06b6d4', strokeWidth: 0 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                </div>
            </div >

            {/* Footer Notice */}
            < div className="max-w-4xl mx-auto mt-12 p-8 rounded-2xl bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-700/30 text-center" >
                <h3 className="text-xl font-black text-yellow-800 dark:text-yellow-500 mb-4">Note on this Calculator:</h3>
                <div className="space-y-4 text-sm font-medium text-yellow-900/80 dark:text-yellow-200/80 leading-relaxed max-w-3xl mx-auto">
                    <p>
                        This is a practice-based project calculator and provides approximate results.
                        Kalasalingam Academy of Research and Education (KARE) follows a Relative Grading policy,
                        where official CGPA and SGPA will be calculated based on the class or slot average of the respective course.
                        Therefore, the actual official results may vary.
                    </p>
                    <p className="pt-2">
                        I'd love to hear from you drop your suggestions or feedback anytime at my inbox! <br />
                        I'm all ears!! <a href="mailto:rajeshwarcn@gmail.com" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">rajeshwarcn@gmail.com</a>.
                    </p>
                </div>
            </div >

            {/* Paste Grade Card Modal */}
            {showPasteModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-in zoom-in duration-300 flex flex-col space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md">
                                    📋
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 dark:text-white">Paste Grade Card Text</h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Copy text from your SIS portal / transcript and paste below</p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setShowPasteModal(false); setPasteError(''); }}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                    Pasted Transcript / Grade Card Text
                                </label>
                                <button
                                    type="button"
                                    onClick={handlePasteFromClipboard}
                                    className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                    <Clipboard size={14} /> Paste from Clipboard
                                </button>
                            </div>
                            <textarea
                                rows={8}
                                value={pastedText}
                                onChange={(e) => { setPastedText(e.target.value); setPasteError(''); }}
                                placeholder={`Paste grade card text here, e.g.:

Semester 1
211BIT1101 Biology for Engineers 3.0 C
211CSE1001 Python Programming 4.0 S
211MAT1001 Engineering Mathematics 4.0 A

Semester 2
211CSE2001 Data Structures 4.0 S
...`}
                                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 text-xs font-mono focus:ring-2 focus:ring-purple-500 outline-none resize-y"
                            />
                        </div>

                        {pasteError && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
                                <AlertTriangle size={16} className="shrink-0" />
                                <span>{pasteError}</span>
                            </div>
                        )}

                        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-xl border border-purple-100 dark:border-purple-800/40 text-xs text-purple-800 dark:text-purple-200 space-y-1">
                            <p className="font-bold flex items-center gap-1">✨ How it works:</p>
                            <p>1. Select and copy all text from your grade card or PDF transcript.</p>
                            <p>2. Paste it above — Gemini AI & Smart Parser will extract course codes, credits, grades & organize semesters automatically!</p>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => { setPastedText(''); setPasteError(''); }}
                                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition"
                            >
                                Clear
                            </button>
                            <button
                                type="button"
                                onClick={handleParsePastedText}
                                disabled={isParsingText}
                                className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl font-bold text-xs shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                            >
                                {isParsingText ? (
                                    <>
                                        <Loader2 className="animate-spin" size={16} />
                                        <span>Organizing Grades with AI...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>✨ Organize & Calculate Grades</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Grade Card Preview Modal */}
            {
                showPreviewModal && extractedData && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in duration-300 flex flex-col">
                            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-t-2xl flex justify-between items-center z-10">
                                <div>
                                    <h2 className="text-2xl font-black">Grade Card Data Extracted ✨</h2>
                                    <p className="text-sm opacity-90 mt-1">Review the data before importing</p>
                                </div>
                                <button onClick={cancelImport} className="p-2 hover:bg-white/20 rounded-full transition">
                                    <Trash2 size={20} />
                                </button>
                            </div>

                            <div className="p-6 space-y-6 overflow-y-auto">
                                {/* Student Info */}
                                {extractedData.studentName !== undefined && (
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                                        <h3 className="font-bold text-blue-800 dark:text-blue-300 text-xs uppercase tracking-wider mb-1">Student Details</h3>
                                        <input
                                            type="text"
                                            value={extractedData.studentName || ''}
                                            onChange={(e) => setExtractedData({ ...extractedData, studentName: e.target.value })}
                                            className="w-full max-w-md p-1 rounded bg-transparent hover:bg-blue-100/50 dark:hover:bg-blue-900/30 focus:bg-white dark:focus:bg-slate-900 border border-transparent focus:border-blue-500 text-base font-bold outline-none transition"
                                            placeholder="Student Name"
                                        />
                                    </div>
                                )}

                                {/* Semesters & Courses */}
                                <div className="space-y-6">
                                    <h3 className="font-bold text-slate-700 dark:text-gray-300 text-lg border-b pb-2">Extracted Courses</h3>

                                    {extractedData.semesters?.map((sem, semIdx) => (
                                        <div key={semIdx} className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-bold px-3 py-1 rounded-full text-sm">
                                                    Semester {sem.semester}
                                                </div>
                                                <div className="text-sm opacity-60">
                                                    {sem.courses?.length || 0} Courses
                                                </div>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm text-left">
                                                    <thead className="bg-slate-100 dark:bg-slate-700 text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
                                                        <tr>
                                                            <th className="px-4 py-2 rounded-l-lg w-28">Code</th>
                                                            <th className="px-4 py-2">Course Name</th>
                                                            <th className="px-4 py-2 w-20 text-center">Credits</th>
                                                            <th className="px-4 py-2 w-24">Grade</th>
                                                            <th className="px-4 py-2 rounded-r-lg w-12 text-center">Action</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                        {sem.courses?.map((course, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                                                <td className="px-4 py-1.5 font-mono text-xs opacity-70">
                                                                    <input
                                                                        type="text"
                                                                        value={course.code || ''}
                                                                        onChange={(e) => handleExtractedCourseChange(semIdx, idx, 'code', e.target.value)}
                                                                        className="w-full p-1 rounded bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700/50 focus:bg-white dark:focus:bg-slate-900 border border-transparent focus:border-purple-500 text-xs font-mono outline-none transition"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-1.5 font-medium">
                                                                    <input
                                                                        type="text"
                                                                        value={course.name || ''}
                                                                        onChange={(e) => handleExtractedCourseChange(semIdx, idx, 'name', e.target.value)}
                                                                        className="w-full p-1 rounded bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700/50 focus:bg-white dark:focus:bg-slate-900 border border-transparent focus:border-purple-500 text-xs outline-none transition"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-1.5">
                                                                    <input
                                                                        type="number"
                                                                        step="0.5"
                                                                        min="0"
                                                                        max="10"
                                                                        value={course.credits}
                                                                        onChange={(e) => handleExtractedCourseChange(semIdx, idx, 'credits', e.target.value)}
                                                                        className="w-full p-1 rounded bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700/50 focus:bg-white dark:focus:bg-slate-900 border border-transparent focus:border-purple-500 text-xs outline-none transition text-center"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-1.5 font-bold text-purple-600 dark:text-purple-400">
                                                                    <select
                                                                        value={course.grade}
                                                                        onChange={(e) => handleExtractedCourseChange(semIdx, idx, 'grade', e.target.value)}
                                                                        className="w-full p-1 rounded bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700/50 focus:bg-white dark:focus:bg-slate-900 border border-transparent focus:border-purple-500 text-xs font-bold outline-none cursor-pointer transition appearance-none"
                                                                    >
                                                                        {getGradeOptions(regulation).map(g => (
                                                                            <option key={g} value={g}>{g}</option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                                <td className="px-4 py-1.5 text-center">
                                                                    <button
                                                                        onClick={() => handleExtractedCourseRemove(semIdx, idx)}
                                                                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition cursor-pointer"
                                                                        title="Remove course"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Summary */}
                                {extractedData.totalCGPA !== undefined && extractedData.totalCGPA !== null && (
                                    <div className="flex justify-end">
                                        <div className="bg-green-100 dark:bg-green-900/30 px-6 py-3 rounded-xl border border-green-200 dark:border-green-800 text-center flex flex-col items-center">
                                            <div className="text-xs font-bold uppercase text-green-700 dark:text-green-400 tracking-wider mb-1">Detected CGPA</div>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="10"
                                                value={extractedData.totalCGPA || ''}
                                                onChange={(e) => setExtractedData({ ...extractedData, totalCGPA: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                                className="w-20 p-1 rounded bg-transparent hover:bg-green-200/50 dark:hover:bg-green-900/50 focus:bg-white dark:focus:bg-slate-900 border border-transparent focus:border-green-500 text-2xl font-black text-center outline-none transition"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Verification Note */}
                            <div className="mx-6 mb-2 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl flex items-start gap-3">
                                <AlertTriangle className="text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" size={18} />
                                <div className="text-sm text-orange-800 dark:text-orange-200">
                                    <strong>Important:</strong> Please verify all course codes, credits, and grades above.
                                    <br />
                                    You can <strong>edit any field directly in this preview table</strong> or delete lines before importing.
                                </div>
                            </div>

                            <div className="p-6 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl flex gap-4">
                                <button
                                    onClick={cancelImport}
                                    className="flex-1 py-3 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-gray-200 rounded-xl font-bold shadow-sm border border-slate-200 dark:border-slate-600 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmImport}
                                    className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold shadow-lg transform transition active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Save size={20} />
                                    Import Data
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Tutorial Modal */}
            {
                showTutorial && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in duration-300">
                            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
                                <h2 className="text-2xl font-black">Welcome to KARE CGPA Calculator! 🎓</h2>
                                <p className="text-sm opacity-90 mt-1">Quick tutorial to get you started</p>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 font-black">1</div>
                                        <div>
                                            <h3 className="font-bold text-lg mb-1">Calculate SGPA (Single Semester)</h3>
                                            <p className="text-sm opacity-80">Use the <strong>SGPA Finder</strong> tab to enter courses with credits and grades. Hit "Calculate SGPA" to see your result.</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 font-black">2</div>
                                        <div>
                                            <h3 className="font-bold text-lg mb-1">Save & Build Semester History</h3>
                                            <p className="text-sm opacity-80">Click <strong>"Save & Next Sem"</strong> to save your semester and start fresh for the next one. Your history builds automatically!</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 font-black">3</div>
                                        <div>
                                            <h3 className="font-bold text-lg mb-1">Calculate Overall CGPA</h3>
                                            <p className="text-sm opacity-80">Switch to the <strong>CGPA Calculator</strong> tab to see your cumulative GPA across all saved semesters.</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center text-yellow-600 dark:text-yellow-400 font-black">4</div>
                                        <div>
                                            <h3 className="font-bold text-lg mb-1">Plan Your Target CGPA</h3>
                                            <p className="text-sm opacity-80">Use the <strong>Target Calculator</strong> to find out what SGPA you need in remaining semesters to achieve your goal!</p>
                                        </div>
                                    </div>

                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                                        <h4 className="font-bold text-sm mb-2 text-blue-800 dark:text-blue-300">💡 Pro Tips:</h4>
                                        <ul className="text-sm space-y-1 opacity-90 list-disc list-inside">
                                            <li><strong>Export/Import:</strong> Backup your data anytime (green button in sidebar)</li>
                                            <li><strong>Undo:</strong> Accidentally deleted? Press Ctrl/Cmd+Z or click the yellow Undo button</li>
                                            <li><strong>Course Names:</strong> Add optional names to remember your subjects</li>
                                            <li><strong>Statistics:</strong> View your performance trends in the sidebar</li>
                                        </ul>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setShowTutorial(false)}
                                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg transform transition active:scale-95"
                                >
                                    Got it! Let's Start 🚀
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
