import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getApiConfigError } from '../config/env';
import WelcomeScreen from '../screens/WelcomeScreen';
import StudentLoginScreen from '../screens/StudentLoginScreen';
import StudentRegisterScreen from '../screens/StudentRegisterScreen';
import StudentHomeScreen from '../screens/StudentHomeScreen';
import FavouritesScreen from '../screens/FavouritesScreen';
import StudentProfileScreen from '../screens/StudentProfileScreen';
import AccommodationDetailScreen from '../screens/AccommodationDetailScreen';
import LoadingScreen from '../screens/LoadingScreen';
import ConfigErrorScreen from '../screens/ConfigErrorScreen';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.warmWhite,
    primary: colors.primaryNavy,
    card: colors.warmWhite,
    text: colors.bodyText,
    border: colors.border,
  },
};

function TabLabel({ label, focused }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: focused ? '700' : '500', color: focused ? colors.primaryNavy : colors.mutedText }}>
      {label}
    </Text>
  );
}

function StudentTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.warmWhite },
        headerTintColor: colors.primaryNavy,
        headerTitleStyle: { color: colors.primaryNavy, fontWeight: '700' },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border, height: 58, paddingBottom: 6, paddingTop: 6 },
        tabBarActiveTintColor: colors.primaryNavy,
        tabBarInactiveTintColor: colors.mutedText,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={StudentHomeScreen}
        options={{ title: 'Home', tabBarLabel: ({ focused }) => <TabLabel label="Home" focused={focused} /> }}
      />
      <Tab.Screen
        name="FavouritesTab"
        component={FavouritesScreen}
        options={{ title: 'Favourites', tabBarLabel: ({ focused }) => <TabLabel label="Favourites" focused={focused} /> }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={StudentProfileScreen}
        options={{ title: 'Profile', tabBarLabel: ({ focused }) => <TabLabel label="Profile" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.warmWhite },
        headerTintColor: colors.primaryNavy,
        headerTitleStyle: { color: colors.primaryNavy, fontWeight: '600' },
        contentStyle: { backgroundColor: colors.warmWhite },
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="StudentLogin" component={StudentLoginScreen} options={{ title: 'Student Login' }} />
      <Stack.Screen name="StudentRegister" component={StudentRegisterScreen} options={{ title: 'Student Registration' }} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.warmWhite },
        headerTintColor: colors.primaryNavy,
        headerTitleStyle: { color: colors.primaryNavy, fontWeight: '600' },
        contentStyle: { backgroundColor: colors.warmWhite },
      }}
    >
      <Stack.Screen name="StudentTabs" component={StudentTabs} options={{ headerShown: false }} />
      <Stack.Screen name="AccommodationDetail" component={AccommodationDetailScreen} options={{ title: 'Accommodation Details' }} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isRestoring, restoreError, restoreSession, logout, setUser } = useAuth();
  const configError = getApiConfigError();

  if (configError) {
    return <ConfigErrorScreen message={configError} />;
  }

  if (isRestoring) {
    return <LoadingScreen message="Restoring your session..." />;
  }

  if (restoreError && restoreError.code === 'API_CONFIG_ERROR') {
    return <LoadingScreen error={restoreError} onRetry={restoreSession} />;
  }

  const continueToSignIn = async () => {
    try {
      await logout();
    } catch {
      setUser(null);
    }
  };

  return (
    <NavigationContainer theme={navTheme}>
      {restoreError && !isAuthenticated ? (
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.warmWhite } }}>
          <Stack.Screen name="RestoreIssue">
            {(props) => (
              <LoadingScreen
                {...props}
                error={restoreError}
                onRetry={restoreSession}
                secondaryActionLabel="Continue to sign in"
                onSecondaryAction={continueToSignIn}
              />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      ) : isAuthenticated ? (
        <AppStack />
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}
