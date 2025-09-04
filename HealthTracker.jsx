// Updated HealthTracker.jsx to include PWA functionality
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, collection, setDoc, updateDoc, deleteDoc, addDoc, getDocs, query, where } from 'firebase/firestore';
import { useForm } from "react-hook-form";
import { format } from 'date-fns';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { AnimatePresence, motion } from "framer-motion";
import { PlusCircle, Trash2, Edit, Save, XCircle, ChevronLeft, ChevronRight, BarChart2, Calendar, User, Info, WifiOff } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './shadcn-ui-dialog.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// --- Firebase Configuration and Initialization (DO NOT MODIFY) ---
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase App and Services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- React App Component ---
export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);
  const [healthData, setHealthData] = useState([]);
  const [dailyMood, setDailyMood] = useState({});
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' or 'log'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'edit' or 'delete'
  const [modalData, setModalData] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  // Handle network status changes
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Firebase Auth and Firestore Initialization
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      try {
        if (!user && initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else if (!user) {
          await signInAnonymously(auth);
        }
        setUserId(auth.currentUser.uid);
        setAuthReady(true);
      } catch (e) {
        console.error("Firebase Auth Error:", e);
        setError("Failed to authenticate with Firebase.");
      }
    });
    return () => unsubscribe();
  }, [initialAuthToken]);

  // Fetch data from Firestore
  useEffect(() => {
    if (!authReady || !userId) return;

    setLoading(true);
    const healthRef = collection(db, `artifacts/${appId}/users/${userId}/health`);
    const moodRef = collection(db, `artifacts/${appId}/users/${userId}/daily_mood`);

    const unsubscribeHealth = onSnapshot(healthRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setHealthData(data.sort((a, b) => new Date(b.date) - new Date(a.date)));
      setLoading(false);
    }, (e) => {
      console.error("Firestore Health Data Error:", e);
      setError("Failed to fetch health data.");
      setLoading(false);
    });

    const unsubscribeMood = onSnapshot(moodRef, (snapshot) => {
      const data = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data().mood;
      });
      setDailyMood(data);
    }, (e) => {
      console.error("Firestore Mood Data Error:", e);
    });

    return () => {
      unsubscribeHealth();
      unsubscribeMood();
    };
  }, [authReady, userId]);

  // PWA Service Worker Registration
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then((registration) => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch((error) => {
          console.log('Service Worker registration failed:', error);
        });
    }
  }, []);

  const handleAddLog = async (data) => {
    const formattedDate = format(new Date(), 'yyyy-MM-dd');
    const newLog = {
      ...data,
      date: formattedDate,
      timestamp: new Date().toISOString(),
      waterIntake: Number(data.waterIntake),
      exercise: data.exercise.split(',').map(item => item.trim()),
      mood: dailyMood[formattedDate] || 'neutral',
    };
    try {
      if (isOffline) {
        alert("You are offline. Cannot add new entry. Please try again when online.");
        return;
      }
      const healthRef = collection(db, `artifacts/${appId}/users/${userId}/health`);
      await addDoc(healthRef, newLog);
      reset();
    } catch (e) {
      console.error("Error adding document: ", e);
      setError("Failed to add log.");
    }
  };

  const handleEditLog = async (data) => {
    try {
      if (isOffline) {
        alert("You are offline. Cannot edit entry. Please try again when online.");
        return;
      }
      const docRef = doc(db, `artifacts/${appId}/users/${userId}/health`, modalData.id);
      await updateDoc(docRef, {
        waterIntake: Number(data.waterIntake),
        exercise: data.exercise.split(',').map(item => item.trim()),
        notes: data.notes,
      });
      setIsModalOpen(false);
      reset();
    } catch (e) {
      console.error("Error updating document: ", e);
      setError("Failed to update log.");
    }
  };

  const handleDeleteLog = async () => {
    try {
      if (isOffline) {
        alert("You are offline. Cannot delete entry. Please try again when online.");
        return;
      }
      const docRef = doc(db, `artifacts/${appId}/users/${userId}/health`, modalData.id);
      await deleteDoc(docRef);
      setIsModalOpen(false);
    } catch (e) {
      console.error("Error deleting document: ", e);
      setError("Failed to delete log.");
    }
  };

  const handleMoodChange = async (date, mood) => {
    try {
      if (isOffline) {
        alert("You are offline. Cannot update mood. Please try again when online.");
        return;
      }
      const moodRef = doc(db, `artifacts/${appId}/users/${userId}/daily_mood`, date);
      await setDoc(moodRef, { mood });
    } catch (e) {
      console.error("Error setting mood: ", e);
      setError("Failed to set mood.");
    }
  };

  const openEditModal = (log) => {
    setModalData(log);
    setModalType('edit');
    setValue('waterIntake', log.waterIntake);
    setValue('exercise', log.exercise.join(', '));
    setValue('notes', log.notes);
    setIsModalOpen(true);
  };

  const openDeleteModal = (log) => {
    setModalData(log);
    setModalType('delete');
    setIsModalOpen(true);
  };

  const renderDashboard = () => {
    const chartData = {
      labels: healthData.map(log => log.date).reverse(),
      datasets: [
        {
          label: 'Water Intake (ml)',
          data: healthData.map(log => log.waterIntake).reverse(),
          borderColor: '#4ADE80',
          backgroundColor: 'rgba(74, 222, 128, 0.5)',
          tension: 0.4,
          pointBackgroundColor: '#4ADE80',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#4ADE80',
        },
      ],
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: 'Health Trends Over Time',
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Date',
          },
        },
        y: {
          title: {
            display: true,
            text: 'Water Intake (ml)',
          },
        },
      },
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="p-6 md:p-8 space-y-8 bg-gray-50 rounded-lg shadow-inner"
      >
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold mb-4 text-center text-gray-800">
            <BarChart2 className="inline-block mr-2" />
            Health Trends
          </h2>
          <div className="h-80 w-full">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold mb-4 text-center text-gray-800">
            <Calendar className="inline-block mr-2" />
            Daily Mood Tracker
          </h2>
          <div className="flex flex-wrap gap-4 justify-center">
            {['happy', 'neutral', 'sad'].map(mood => (
              <button
                key={mood}
                onClick={() => handleMoodChange(format(new Date(), 'yyyy-MM-dd'), mood)}
                className={`py-2 px-4 rounded-full font-semibold transition-all duration-300 transform hover:scale-105
                  ${dailyMood[format(new Date(), 'yyyy-MM-dd')] === mood ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`
                }
              >
                {mood === 'happy' ? '😊 Happy' : mood === 'neutral' ? '😐 Neutral' : '😔 Sad'}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    );
  };

  const renderLog = () => {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="p-6 md:p-8 space-y-8 bg-gray-50 rounded-lg shadow-inner"
      >
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center justify-center">
            <PlusCircle className="mr-2 text-emerald-500" />
            Add New Health Log
          </h2>
          <form onSubmit={handleSubmit(handleAddLog)} className="space-y-4">
            <div>
              <label htmlFor="waterIntake" className="block text-gray-700 font-semibold mb-1">
                Water Intake (ml)
              </label>
              <input
                id="waterIntake"
                type="number"
                {...register('waterIntake', { required: 'Water intake is required.', min: { value: 0, message: 'Must be a positive number.' } })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                placeholder="e.g., 2000"
              />
              {errors.waterIntake && <p className="text-red-500 text-sm mt-1">{errors.waterIntake.message}</p>}
            </div>

            <div>
              <label htmlFor="exercise" className="block text-gray-700 font-semibold mb-1">
                Exercise
              </label>
              <input
                id="exercise"
                type="text"
                {...register('exercise')}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                placeholder="e.g., Running, Yoga"
              />
            </div>

            <div>
              <label htmlFor="notes" className="block text-gray-700 font-semibold mb-1">
                Notes
              </label>
              <textarea
                id="notes"
                {...register('notes')}
                rows="3"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                placeholder="Any additional notes..."
              ></textarea>
            </div>
            <button
              type="submit"
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold rounded-full shadow-lg hover:from-emerald-600 hover:to-green-700 transition-all duration-300 transform hover:scale-105"
            >
              <PlusCircle className="inline-block mr-2" /> Add Log
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center justify-center">
            <Calendar className="mr-2 text-emerald-500" />
            Recent Logs
          </h2>
          <AnimatePresence mode="popLayout">
            {healthData.length > 0 ? (
              healthData.map((log) => (
                <motion.div
                  key={log.id}
                  layout
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="bg-gray-100 p-4 rounded-lg mb-4 shadow-sm flex items-start justify-between"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-lg text-gray-800">{log.date}</p>
                    <p className="text-sm text-gray-600">Water: {log.waterIntake}ml</p>
                    <p className="text-sm text-gray-600">Exercise: {log.exercise.join(', ')}</p>
                    {log.notes && <p className="text-sm text-gray-600 mt-1 italic">Notes: "{log.notes}"</p>}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button onClick={() => openEditModal(log)} className="text-blue-500 hover:text-blue-700 transition-colors">
                      <Edit size={20} />
                    </button>
                    <button onClick={() => openDeleteModal(log)} className="text-red-500 hover:text-red-700 transition-colors">
                      <Trash2 size={20} />
                    </button>
                  </div>
                </motion.div>
              ))
            ) : (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-gray-500 mt-8"
              >
                No health logs yet. Add your first log above!
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  };

  const MemoizedDashboard = React.memo(renderDashboard);
  const MemoizedLog = React.memo(renderLog);

  const ModalContent = () => {
    if (modalType === 'edit') {
      return (
        <form onSubmit={handleSubmit(handleEditLog)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Edit Health Log</DialogTitle>
            <DialogDescription>
              <span className="text-emerald-500 font-semibold">{modalData?.date}</span>
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="waterIntake" className="block text-gray-700 font-semibold mb-1">Water Intake (ml)</label>
            <input id="waterIntake" type="number" {...register('waterIntake', { required: true, min: 0 })} className="w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label htmlFor="exercise" className="block text-gray-700 font-semibold mb-1">Exercise</label>
            <input id="exercise" type="text" {...register('exercise')} className="w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label htmlFor="notes" className="block text-gray-700 font-semibold mb-1">Notes</label>
            <textarea id="notes" {...register('notes')} rows="3" className="w-full p-2 border border-gray-300 rounded-lg"></textarea>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsModalOpen(false)} className="py-2 px-4 rounded-lg bg-gray-300 text-gray-800 hover:bg-gray-400 transition-colors">
              <XCircle className="inline-block mr-1" /> Cancel
            </button>
            <button type="submit" className="py-2 px-4 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
              <Save className="inline-block mr-1" /> Save Changes
            </button>
          </div>
        </form>
      );
    } else if (modalType === 'delete') {
      return (
        <div className="space-y-4 text-center">
          <DialogHeader>
            <DialogTitle>Delete Health Log</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this log from <span className="text-emerald-500 font-semibold">{modalData?.date}</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-4">
            <button onClick={() => setIsModalOpen(false)} className="py-2 px-4 rounded-lg bg-gray-300 text-gray-800 hover:bg-gray-400 transition-colors">
              <ChevronLeft className="inline-block mr-1" /> Cancel
            </button>
            <button onClick={handleDeleteLog} className="py-2 px-4 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
              <Trash2 className="inline-block mr-1" /> Delete
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  if (!authReady || loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="animate-spin rounded-full h-32 w-32 border-b-4 border-emerald-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-red-50 text-red-700 p-4 rounded-lg">
        <Info size={48} className="mb-4" />
        <p className="font-semibold text-lg">An error occurred:</p>
        <p className="text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-800 p-4 md:p-8">
      <div className="container mx-auto max-w-4xl bg-white rounded-xl shadow-lg overflow-hidden">
        <header className="bg-gradient-to-r from-emerald-500 to-green-600 text-white p-6 text-center shadow-md">
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="inline-block animate-pulse">💚</span>
            <span className="ml-2">My Health Tracker</span>
          </h1>
          <p className="text-sm opacity-90 mt-1">Your journey to a healthier you.</p>
          <p className="text-xs mt-2">
            <User size={12} className="inline-block mr-1" /> User ID: <span className="font-mono text-xs opacity-70 break-all">{userId}</span>
          </p>
        </header>

        {isOffline && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="p-3 bg-red-400 text-white flex items-center justify-center gap-2"
          >
            <WifiOff size={20} />
            You are currently offline. Some features may not be available.
          </motion.div>
        )}

        <nav className="flex justify-center bg-gray-200 p-2 shadow-inner">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 py-3 px-4 text-center text-lg font-semibold rounded-lg transition-all duration-300 transform hover:scale-105 ${activeTab === 'dashboard' ? 'bg-white text-emerald-600 shadow-md' : 'text-gray-600 hover:bg-gray-300'}`}
          >
            <BarChart2 className="inline-block mr-2" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('log')}
            className={`flex-1 py-3 px-4 text-center text-lg font-semibold rounded-lg transition-all duration-300 transform hover:scale-105 ${activeTab === 'log' ? 'bg-white text-emerald-600 shadow-md' : 'text-gray-600 hover:bg-gray-300'}`}
          >
            <ChevronRight className="inline-block mr-2" />
            Log
          </button>
        </nav>

        <main className="p-4 md:p-8">
          {activeTab === 'dashboard' ? <MemoizedDashboard /> : <MemoizedLog />}
        </main>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px] p-6 bg-white rounded-xl shadow-lg">
          <ModalContent />
        </DialogContent>
      </Dialog>
    </div>
  );
}
