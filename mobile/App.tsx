import React, { useState, useEffect } from 'react'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { getToken } from './src/lib/api'
import { COLORS } from './src/constants/theme'
import LoginScreen from './src/screens/LoginScreen'
import ChatScreen  from './src/screens/ChatScreen'
import FilesScreen from './src/screens/FilesScreen'

const Stack = createStackNavigator()
const Tab   = createBottomTabNavigator()

const NavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.bg,
    card:        COLORS.bgDark,
    border:      COLORS.border,
    text:        COLORS.text,
    primary:     COLORS.cyan,
  },
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: COLORS.bgDark,
        borderTopColor:  COLORS.border,
        borderTopWidth:  1,
        height:          60,
      },
      tabBarActiveTintColor:   COLORS.cyan,
      tabBarInactiveTintColor: COLORS.dim,
      tabBarLabelStyle: {
        fontFamily:   'Courier New',
        fontSize:     9,
        letterSpacing: 1,
        marginBottom: 4,
      },
    }}>
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarLabel: 'ELARA',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>⬟</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Files"
        component={FilesScreen}
        options={{
          tabBarLabel: 'FILES',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>⬡</Text>
          ),
        }}
      />
    </Tab.Navigator>
  )
}

export default function App() {
  const [authed, setAuthed]     = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    getToken().then(t => { setAuthed(!!t); setChecking(false) })
  }, [])

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="light" />
      </View>
    )
  }

  return (
    <NavigationContainer theme={NavTheme}>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {authed ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login">
            {() => <LoginScreen onLogin={() => setAuthed(true)} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
