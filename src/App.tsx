import React, { useEffect } from 'react';
import { TimeTablePage } from '@/pages/TimeTablePage/TimeTablePage.tsx';
import {
    // APIGetUserInfo,
    APIGetUsers
} from '@/api/user.api.ts';
// import {Loader} from "@/components/Loader/Loader.tsx";
// import '@/components/App.css'

const App: React.FC = () => {
    useEffect(() => {
        // APIGetUserInfo().then();
        APIGetUsers().then();
    }, []);
    return (
        <TimeTablePage />
    );
}

export default App
